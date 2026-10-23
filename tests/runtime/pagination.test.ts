import { describe, it, expect } from 'vitest';
import { BaseClient } from '../../examples/petstore/generated/typescript/src/core/api-client.js';
import { CursorPage, OffsetPage } from '../../examples/petstore/generated/typescript/src/core/pagination.js';

describe('configured pagination', () => {
  it('follows a response cursor and custom item field', async () => {
    const seen: URL[] = [];
    const responses = [
      { results: [{ key: 'first' }], following: 'cursor two' },
      { results: [{ key: 'second' }], following: null },
    ];
    const client = new BaseClient({ baseURL: 'https://example.test', fetch: async (input) => {
      seen.push(new URL(String(input)));
      return Response.json(responses[seen.length - 1]);
    } });
    const page = await client.getAPIList('/items', CursorPage, {
      pagination: { type: 'cursor', request: { cursorParam: 'next' }, response: {
        itemsKey: 'results', cursorSource: 'next_cursor_field', nextCursorKey: 'following',
      } },
    });
    expect((await page.toArray()).map((item: { key: string }) => item.key)).toEqual(['first', 'second']);
    expect(seen.map((url) => url.searchParams.get('next'))).toEqual([null, 'cursor two']);
  });

  it.each([
    { mode: 'offset' as const, pageParam: 'start', expected: '2' },
    { mode: 'page_number' as const, pageParam: 'page_number', expected: '2' },
  ])('advances $mode using configured query and total fields', async ({ mode, pageParam, expected }) => {
    const seen: URL[] = [];
    const responses = [
      { entries: [1, 2], count: 3 },
      { entries: [3], count: 3 },
    ];
    const client = new BaseClient({ baseURL: 'https://example.test', fetch: async (input) => {
      seen.push(new URL(String(input)));
      return Response.json(responses[seen.length - 1]);
    } });
    const page = await client.getAPIList('/items', OffsetPage, {
      pagination: { type: 'offset', mode, request: { pageParam, perPageParam: 'size' },
        response: { itemsKey: 'entries', totalKey: 'count' } },
    });
    expect(await page.toArray()).toEqual([1, 2, 3]);
    expect(seen[1]?.searchParams.get(pageParam)).toBe(expected);
    expect(seen[1]?.searchParams.get('size')).toBe('2');
  });
});
