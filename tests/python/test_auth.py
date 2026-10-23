import asyncio
import base64
import importlib
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).parent / 'generated'))


class AuthenticationTests(unittest.TestCase):
    def check_request(self, kind, request):
        if kind == 'bearer':
            self.assertEqual(request.headers['authorization'], 'Bearer secret value')
        elif kind == 'basic':
            token = base64.b64encode('alïce:secret'.encode()).decode()
            self.assertEqual(request.headers['authorization'], f'Basic {token}')
        else:
            self.assertNotIn('authorization', request.headers)
        if kind == 'header':
            self.assertEqual(request.headers['custom_key'], 'secret value')
        if kind == 'query':
            self.assertEqual(request.url.params['custom_key'], 'secret value')
        else:
            self.assertNotIn('custom_key', request.url.params)
        if kind == 'cookie':
            self.assertEqual(request.headers['cookie'], 'session=existing; custom_key=secret%20value')

    def test_sync_generated_clients(self):
        for kind in ['bearer', 'basic', 'header', 'query', 'cookie', 'none']:
            with self.subTest(kind=kind), patch.dict(os.environ, {
                'ACME_USERNAME': 'alïce', 'ACME_PASSWORD': 'secret',
            }):
                module = importlib.import_module(f'auth_{kind}')
                with module.Acme(api_key='secret value') as client:
                    requests = []
                    client._client.close()
                    client._client = httpx.Client(transport=httpx.MockTransport(
                        lambda request: requests.append(request) or httpx.Response(200, json={})
                    ))
                    client.get('/check', headers={'Cookie': 'session=existing'})
                    self.check_request(kind, requests[0])
                    client.get('/check', headers={'Authorization': 'Custom override'})
                    self.assertEqual(requests[1].headers['authorization'], 'Custom override')

    def test_async_generated_clients(self):
        async def check():
            for kind in ['bearer', 'basic', 'header', 'query', 'cookie', 'none']:
                with self.subTest(kind=kind):
                    module = importlib.import_module(f'auth_{kind}')
                    async with module.AsyncAcme(api_key='secret value') as client:
                        requests = []
                        await client._client.aclose()
                        client._client = httpx.AsyncClient(transport=httpx.MockTransport(
                            lambda request: requests.append(request) or httpx.Response(200, json={})
                        ))
                        await client.get('/check', headers={'Cookie': 'session=existing'})
                        self.check_request(kind, requests[0])
        with patch.dict(os.environ, {'ACME_USERNAME': 'alïce', 'ACME_PASSWORD': 'secret'}):
            asyncio.run(check())
