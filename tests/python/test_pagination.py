import asyncio
import importlib
from pathlib import Path
import sys
import unittest

import httpx

sys.path.insert(0, str(Path(__file__).parent / 'generated'))


class PaginationTests(unittest.TestCase):
    def check_sync(self, page_name, config, pages, query_key, expected):
        module = importlib.import_module('auth_none._core')
        page_class = getattr(module, page_name)
        seen = []

        def respond(request):
            seen.append(request.url)
            return httpx.Response(200, json=pages[len(seen) - 1])

        with module.SyncAPIClient(base_url='https://example.test', http_client=httpx.Client(
            transport=httpx.MockTransport(respond)
        )) as client:
            page = client._get_page(page_class, '/items', pagination=config)
            items = [item for current in page.iter_pages() for item in current.data]
            self.assertEqual(len(items), 3)
            self.assertEqual(seen[1].params.get(query_key), expected)

    def test_cursor_response_field(self):
        self.check_sync('SyncCursorPage', {
            'items_key': 'entries', 'has_more_key': 'more', 'cursor_param': 'next',
            'cursor_field': 'key',
        }, [
            {'entries': [{'key': 'a'}, {'key': 'b'}], 'more': True},
            {'entries': [{'key': 'c'}], 'more': False},
        ], 'next', 'b')

    def test_numeric_offset(self):
        self.check_sync('SyncOffsetPage', {
            'items_key': 'entries', 'total_key': 'count', 'page_param': 'start',
            'per_page_param': 'size', 'mode': 'offset',
        }, [
            {'entries': [1, 2], 'count': 3},
            {'entries': [3], 'count': 3},
        ], 'start', '2')

    def test_zero_cursor_is_a_next_page(self):
        self.check_sync('SyncCursorPage', {
            'items_key': 'entries', 'cursor_param': 'next',
            'cursor_source': 'next_cursor_field', 'next_cursor_key': 'following',
        }, [
            {'entries': [1, 2], 'following': 0},
            {'entries': [3], 'following': None},
        ], 'next', '0')

    def test_async_page_numbers(self):
        async def check():
            module = importlib.import_module('auth_none._core')
            seen = []

            def respond(request):
                seen.append(request.url)
                return httpx.Response(200, json={
                    'entries': [1, 2] if len(seen) == 1 else [3], 'count': 3,
                })

            async with module.AsyncAPIClient(base_url='https://example.test', http_client=httpx.AsyncClient(
                transport=httpx.MockTransport(respond)
            )) as client:
                page = await client._get_page(module.AsyncOffsetPage, '/items', pagination={
                    'items_key': 'entries', 'total_key': 'count', 'page_param': 'page_number',
                    'per_page_param': 'size', 'mode': 'page_number',
                })
                items = []
                async for current in page.iter_pages():
                    items.extend(current.data)
                self.assertEqual(items, [1, 2, 3])
                self.assertEqual(seen[1].params.get('page_number'), '2')

        asyncio.run(check())
