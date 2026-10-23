import asyncio
import importlib
from pathlib import Path
import sys
import unittest

import httpx

sys.path.insert(0, str(Path(__file__).parent / 'generated'))


class OpenAPICoverageTests(unittest.TestCase):
    def test_sync_text_request_and_binary_response(self):
        module = importlib.import_module('wire_fixture')
        requests = []

        def respond(request):
            requests.append(request)
            return httpx.Response(200, content=b'hello' if request.url.path == '/wire' else b'\x00\xff')

        with module.Acme() as client:
            client._client.close()
            client._client = httpx.Client(transport=httpx.MockTransport(respond))
            self.assertEqual(client.wire.send('hello', x_trace='trace', session='a b', query={
                'tags': ['a', 'b'], 'filter': {'active': True},
                'fields': ['name', 'age'], 'flags': {'enabled': True},
            }), 'hello')
            self.assertEqual(client.wire.download(), b'\x00\xff')
            client.wire.upload(b'\x01\x02')
            client.wire.lookup('a/b?c')

        request = requests[0]
        self.assertEqual(request.content, b'hello')
        self.assertEqual(request.headers['content-type'], 'text/plain')
        self.assertEqual(request.headers['x-trace'], 'trace')
        self.assertEqual(request.headers['cookie'], 'session=a%20b')
        self.assertEqual(request.url.params['tags'], 'a,b')
        self.assertEqual(request.url.params['filter[active]'], 'true')
        self.assertEqual(request.url.params['fields'], 'name|age')
        self.assertEqual(request.url.params['flags'], 'enabled,true')
        self.assertEqual(requests[2].content, b'\x01\x02')
        self.assertEqual(requests[2].headers['content-type'], 'application/octet-stream')
        self.assertEqual(requests[1].headers['accept'], 'application/pdf')
        self.assertTrue(str(requests[3].url).endswith('/wire/a%2Fb%3Fc'))

    def test_async_optional_body(self):
        module = importlib.import_module('wire_fixture')

        async def check():
            async with module.AsyncAcme() as client:
                await client._client.aclose()
                client._client = httpx.AsyncClient(transport=httpx.MockTransport(
                    lambda request: httpx.Response(200, text='empty' if not request.content else 'unexpected')
                ))
                self.assertEqual(await client.wire.send(x_trace='trace'), 'empty')

        asyncio.run(check())
