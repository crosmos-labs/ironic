import { describe, it, expect } from 'vitest';
import { plan } from '../src/index.js';
import type { IronicConfig, ParsedSpec } from '../src/index.js';

function makeConfig(overrides: Partial<IronicConfig> = {}): IronicConfig {
  return {
    version: 1,
    spec: './openapi.json',
    targets: { typescript: { package_name: 'test-sdk', output_dir: './out' } },
    ...overrides,
  } as IronicConfig;
}

function makeSpec(ops: Record<string, unknown>): ParsedSpec {
  return {
    info: { title: 'Test', version: '0.1.0' },
    servers: [],
    paths: ops,
    schemas: {},
    schemaRegistry: new Map(),
    securitySchemes: {},
  };
}

// Helpers to build operation objects
function listOp(queryParams: string[], responseProps: Record<string, unknown>) {
  return {
    get: {
      operationId: 'list',
      parameters: queryParams.map((name) => ({ name, in: 'query', schema: { type: 'string' } })),
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { type: 'object', properties: responseProps },
            },
          },
        },
      },
    },
  };
}

describe('pagination heuristics (Tier 4)', () => {
  it('attaches the matching configured scheme to each operation', () => {
    const config = makeConfig({ pagination: [
      { type: 'cursor', request: { cursor_param: 'next' }, response: {
        items_key: 'entries', cursor_source: 'next_cursor_field', next_cursor_field: 'following',
      } },
      { type: 'page_number', request: { page_param: 'page_number', per_page_param: 'size' },
        response: { items_key: 'entries', total_key: 'count' } },
    ] });
    const spec = makeSpec({
      '/items': listOp(['next'], { entries: { type: 'array', items: { type: 'object' } }, following: { type: 'string' } }),
      '/pages': listOp(['page_number', 'size'], { entries: { type: 'array', items: { type: 'object' } }, count: { type: 'integer' } }),
    });
    const ir = plan(config, spec);
    const methods = ir.resources.flatMap((resource) => resource.methods);
    expect(methods.find((method) => method.path === '/items')?.paginationConfig?.response).toMatchObject({
      itemsKey: 'entries', nextCursorKey: 'following',
    });
    expect(methods.find((method) => method.path === '/pages')?.paginationConfig).toMatchObject({
      mode: 'page_number', request: { pageParam: 'page_number', perPageParam: 'size' },
    });
  });
  describe('4.1 offset detection', () => {
    it('detects offset pagination via limit+offset params + count in response', () => {
      const spec = makeSpec({
        '/items': listOp(
          ['limit', 'offset'],
          { data: { type: 'array', items: { type: 'object' } }, count: { type: 'integer' } },
        ),
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBe('offset');
      expect(method?.paginationConfig?.mode).toBe('offset');
    });

    it('detects offset pagination when response has "total" instead of "count"', () => {
      const spec = makeSpec({
        '/items': listOp(
          ['limit', 'offset'],
          { data: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } },
        ),
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBe('offset');
    });

    it('does not detect offset when "offset" param is missing', () => {
      const spec = makeSpec({
        '/items': listOp(
          ['limit'],
          { data: { type: 'array', items: { type: 'object' } }, count: { type: 'integer' } },
        ),
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBeUndefined();
    });
  });

  describe('4.1 cursor detection', () => {
    it('detects cursor pagination via after+limit params + has_more in response', () => {
      const spec = makeSpec({
        '/items': listOp(
          ['after', 'limit'],
          { data: { type: 'array', items: { type: 'object' } }, has_more: { type: 'boolean' } },
        ),
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBe('cursor');
    });

    it('detects cursor pagination via cursor param alias', () => {
      const spec = makeSpec({
        '/items': listOp(
          ['cursor', 'limit'],
          { data: { type: 'array', items: { type: 'object' } }, next_cursor: { type: 'string' } },
        ),
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBe('cursor');
    });
  });

  describe('4.2 cursor detection via response shape alone', () => {
    it('detects cursor when response has next_cursor + array field, even without cursor query param', () => {
      const spec = makeSpec({
        '/orgs': listOp(
          ['limit'],
          {
            orgs: { type: 'array', items: { type: 'object' } },
            next_cursor: { type: 'string' },
          },
        ),
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBe('cursor');
    });

    it('does not trigger if response has next_cursor but no array field', () => {
      const spec = makeSpec({
        '/things': listOp(
          ['limit'],
          { next_cursor: { type: 'string' }, name: { type: 'string' } },
        ),
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBeUndefined();
    });
  });

  describe('explicit config overrides heuristics', () => {
    it('uses config cursor_param instead of heuristic when config is present', () => {
      const spec = makeSpec({
        '/items': listOp(
          ['page_token', 'limit'],
          { data: { type: 'array', items: { type: 'object' } }, has_more: { type: 'boolean' } },
        ),
      });
      const config = makeConfig({
        pagination: {
          type: 'cursor',
          request: { cursor_param: 'page_token', limit_param: 'limit' },
          response: { items_key: 'data', has_more_key: 'has_more' },
        },
      });
      const ir = plan(config, spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBe('cursor');
    });
  });

  describe('non-GET methods are never paginated', () => {
    it('does not mark POST as paginated even with limit+offset params', () => {
      const spec = makeSpec({
        '/items': {
          post: {
            parameters: [
              { name: 'limit', in: 'query', schema: { type: 'integer' } },
              { name: 'offset', in: 'query', schema: { type: 'integer' } },
            ],
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { count: { type: 'integer' }, data: { type: 'array', items: {} } } },
                  },
                },
              },
            },
          },
        },
      });
      const ir = plan(makeConfig(), spec);
      const method = ir.resources[0]?.methods[0];
      expect(method?.pagination).toBeUndefined();
    });
  });
});
