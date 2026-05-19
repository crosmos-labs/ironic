// Runtime tests for the generated petstore SDK.
// These import the generated source directly and exercise it against a fake fetch.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PetstoreClient,
  NotFoundError,
  AuthenticationError,
} from '../../examples/petstore/generated/typescript/src/index.js';

type Handler = (req: { url: URL; init: RequestInit }) => { status: number; body?: unknown; headers?: Record<string, string> };

function installFetchMock(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const { status, body, headers } = handler({ url, init });
    return new Response(body == null ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
}

describe('petstore SDK runtime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs a single pet and returns a typed object', async () => {
    installFetchMock(({ url }) => {
      expect(url.pathname).toBe('/v1/pets/abc123');
      return { status: 200, body: { id: 'abc123', name: 'Rex', species: 'dog', status: 'available', created_at: '2026-01-01' } };
    });

    const client = new PetstoreClient({ baseURL: 'https://api.petstore.io/v1', apiKey: 'test' });
    const pet = await client.pets.getPet('abc123');
    expect(pet.id).toBe('abc123');
    expect(pet.name).toBe('Rex');
  });

  it('iterates a paginated list across multiple pages', async () => {
    const pages = [
      { data: [{ id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' }, { id: 'p2', name: 'B', species: 'cat', status: 'available', created_at: 't' }], has_more: true },
      { data: [{ id: 'p3', name: 'C', species: 'dog', status: 'available', created_at: 't' }], has_more: false },
    ];
    let call = 0;
    installFetchMock(({ url }) => {
      if (call === 0) {
        expect(url.searchParams.get('after')).toBeNull();
      } else {
        expect(url.searchParams.get('after')).toBe('p2');
      }
      return { status: 200, body: pages[call++] };
    });

    const client = new PetstoreClient({ apiKey: 'test' });
    const collected: string[] = [];
    const page = await client.pets.listPets();
    for await (const pet of page) collected.push(pet.id);
    expect(collected).toEqual(['p1', 'p2', 'p3']);
  });

  it('throws NotFoundError on 404', async () => {
    installFetchMock(() => ({ status: 404, body: { error: 'not found' } }));
    const client = new PetstoreClient({ apiKey: 'test' });
    await expect(client.pets.getPet('missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws AuthenticationError on 401', async () => {
    installFetchMock(() => ({ status: 401, body: { error: 'unauthorized' } }));
    const client = new PetstoreClient({ apiKey: 'bad' });
    await expect(client.pets.getPet('x')).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('retries on 429 then succeeds', async () => {
    let call = 0;
    installFetchMock(() => {
      if (call++ === 0) {
        return { status: 429, body: { error: 'rate limit' }, headers: { 'retry-after': '0' } };
      }
      return { status: 200, body: { id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' } };
    });
    const client = new PetstoreClient({ apiKey: 'test', maxRetries: 2 });
    const pet = await client.pets.getPet('p1');
    expect(pet.id).toBe('p1');
    expect(call).toBe(2);
  });

  it('APIPromise exposes raw Response via withResponse / asResponse', async () => {
    installFetchMock(() => ({
      status: 200,
      body: { id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' },
      headers: { 'x-request-id': 'req-42' },
    }));
    const client = new PetstoreClient({ apiKey: 'test' });

    const { data, response } = await client.pets.getPet('p1').withResponse();
    expect(data.id).toBe('p1');
    expect(response.headers.get('x-request-id')).toBe('req-42');

    const justResponse = await client.pets.getPet('p1').asResponse();
    expect(justResponse.status).toBe(200);
  });

  it('forwards per-call options (custom header, signal)', async () => {
    let captured: Headers | undefined;
    let receivedSignal: AbortSignal | undefined;
    installFetchMock(({ init }) => {
      captured = new Headers(init.headers);
      receivedSignal = init.signal ?? undefined;
      return { status: 200, body: { id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' } };
    });
    const controller = new AbortController();
    const client = new PetstoreClient({ apiKey: 'test' });
    await client.pets.getPet('p1', {
      headers: { 'X-Trace': 'abc-123' },
      signal: controller.signal,
    });
    expect(captured?.get('x-trace')).toBe('abc-123');
    expect(receivedSignal).toBeDefined();
  });

  it('sends default User-Agent reflecting the SDK package', async () => {
    let captured: Headers | undefined;
    installFetchMock(({ init }) => {
      captured = new Headers(init.headers);
      return { status: 200, body: { id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' } };
    });
    const client = new PetstoreClient({ apiKey: 'test' });
    await client.pets.getPet('p1');
    expect(captured?.get('user-agent')).toMatch(/^@petstore\/sdk\/\d+\.\d+\.\d+ \(ironic\)$/);
  });

  it('invokes the pluggable logger on request lifecycle', async () => {
    installFetchMock(() => ({ status: 200, body: { id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' } }));
    const events: string[] = [];
    const client = new PetstoreClient({
      apiKey: 'test',
      logger: {
        debug: (msg) => events.push(`debug:${msg}`),
      },
    });
    await client.pets.getPet('p1');
    expect(events).toContain('debug:request');
    expect(events).toContain('debug:response');
  });

  it('forwards client-level fetchOptions to fetch', async () => {
    let receivedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      receivedInit = init;
      return new Response(JSON.stringify({ id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = new PetstoreClient({
      apiKey: 'test',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      fetchOptions: { redirect: 'manual', credentials: 'include' },
    });
    await client.pets.getPet('p1');
    expect(receivedInit?.redirect).toBe('manual');
    expect(receivedInit?.credentials).toBe('include');
  });

  it('sends Bearer auth header', async () => {
    let captured: Headers | undefined;
    installFetchMock(({ init }) => {
      captured = new Headers(init.headers);
      return { status: 200, body: { id: 'p1', name: 'A', species: 'dog', status: 'available', created_at: 't' } };
    });
    const client = new PetstoreClient({ apiKey: 'secret-key' });
    await client.pets.getPet('p1');
    expect(captured?.get('authorization')).toBe('Bearer secret-key');
  });
});
