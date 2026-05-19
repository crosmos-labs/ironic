import { describe, it, expect } from 'vitest';
import { applyTransforms } from '../src/planner/transforms.js';
import type { ParsedSpec } from '../src/parser/openapi.js';

function makeSpec(overrides: Partial<ParsedSpec> = {}): ParsedSpec {
  return {
    info: { title: 'Test API', version: '0.1.0' },
    servers: [],
    paths: {},
    schemas: {},
    schemaRegistry: new Map(),
    securitySchemes: {},
    ...overrides,
  };
}

describe('applyTransforms', () => {
  describe('rename_schema', () => {
    it('renames the schema and updates $refs in paths', () => {
      const spec = makeSpec({
        schemas: {
          OldName: { type: 'object', properties: { id: { type: 'string' } } },
        },
        paths: {
          '/things': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/OldName' },
                    },
                  },
                },
              },
            },
          },
        },
      });

      applyTransforms(spec, [{ type: 'rename_schema', from: 'OldName', to: 'NewName' }]);

      expect(spec.schemas['NewName']).toBeDefined();
      expect(spec.schemas['OldName']).toBeUndefined();

      const responseSchema = (spec.paths['/things'] as Record<string, unknown>)
        ?.get as Record<string, unknown>;
      const ref = (responseSchema?.responses as Record<string, unknown>)
        ?.['200'] as Record<string, unknown>;
      const content = ref?.content as Record<string, unknown>;
      const jsonContent = content?.['application/json'] as Record<string, unknown>;
      expect((jsonContent?.schema as Record<string, unknown>)?.$ref).toBe('#/components/schemas/NewName');
    });

    it('is a no-op when the schema does not exist', () => {
      const spec = makeSpec({ schemas: { A: { type: 'object' } } });
      applyTransforms(spec, [{ type: 'rename_schema', from: 'Missing', to: 'B' }]);
      expect(Object.keys(spec.schemas)).toEqual(['A']);
    });
  });

  describe('drop_endpoint', () => {
    it('removes a specific HTTP method from a path', () => {
      const spec = makeSpec({
        paths: {
          '/health': {
            get: { responses: { '200': {} } },
            post: { responses: { '201': {} } },
          },
        },
      });

      applyTransforms(spec, [{ type: 'drop_endpoint', method: 'GET', path: '/health' }]);

      const pathItem = spec.paths['/health'] as Record<string, unknown>;
      expect(pathItem.get).toBeUndefined();
      expect(pathItem.post).toBeDefined();
    });

    it('removes the entire path when no verbs remain', () => {
      const spec = makeSpec({
        paths: {
          '/internal': { get: { responses: {} } },
        },
      });

      applyTransforms(spec, [{ type: 'drop_endpoint', method: 'GET', path: '/internal' }]);

      expect(spec.paths['/internal']).toBeUndefined();
    });

    it('is a no-op when path does not exist', () => {
      const spec = makeSpec({ paths: { '/pets': {} } });
      applyTransforms(spec, [{ type: 'drop_endpoint', method: 'GET', path: '/missing' }]);
      expect(Object.keys(spec.paths)).toEqual(['/pets']);
    });
  });

  describe('extract_inline_schema', () => {
    it('promotes requestBody inline schema to a named component', () => {
      const inlineSchema = { type: 'object', properties: { name: { type: 'string' } } };
      const spec = makeSpec({
        paths: {
          '/pets': {
            post: {
              requestBody: {
                content: { 'application/json': { schema: inlineSchema } },
              },
              responses: {},
            },
          },
        },
      });

      applyTransforms(spec, [
        { type: 'extract_inline_schema', location: 'POST /pets.requestBody', to: 'PetCreateParams' },
      ]);

      expect(spec.schemas['PetCreateParams']).toBe(inlineSchema);
      const rb = ((spec.paths['/pets'] as Record<string, unknown>).post as Record<string, unknown>)
        ?.requestBody as Record<string, unknown>;
      const content = rb?.content as Record<string, unknown>;
      const json = content?.['application/json'] as Record<string, unknown>;
      expect((json.schema as Record<string, unknown>).$ref).toBe('#/components/schemas/PetCreateParams');
    });
  });

  describe('dedupe_schemas', () => {
    it('collapses structurally-equal schemas and rewrites $refs', () => {
      const sharedShape = { type: 'object', properties: { id: { type: 'string' } } };
      const spec = makeSpec({
        schemas: {
          Original: sharedShape,
          Duplicate: { ...sharedShape },
        },
        paths: {
          '/things': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Duplicate' },
                    },
                  },
                },
              },
            },
          },
        },
      });

      applyTransforms(spec, [{ type: 'dedupe_schemas' }]);

      expect(spec.schemas['Duplicate']).toBeUndefined();
      expect(spec.schemas['Original']).toBeDefined();

      const responseSchema = (spec.paths['/things'] as Record<string, unknown>)
        ?.get as Record<string, unknown>;
      const ref = (responseSchema?.responses as Record<string, unknown>)?.['200'] as Record<string, unknown>;
      const json = (ref?.content as Record<string, unknown>)?.['application/json'] as Record<string, unknown>;
      expect((json?.schema as Record<string, unknown>)?.$ref).toBe('#/components/schemas/Original');
    });

    it('keeps schemas that are structurally different', () => {
      const spec = makeSpec({
        schemas: {
          A: { type: 'object', properties: { x: { type: 'string' } } },
          B: { type: 'object', properties: { y: { type: 'number' } } },
        },
      });

      applyTransforms(spec, [{ type: 'dedupe_schemas' }]);

      expect(Object.keys(spec.schemas)).toHaveLength(2);
    });
  });

  describe('transform ordering', () => {
    it('applies transforms in declaration order', () => {
      const spec = makeSpec({
        schemas: {
          Foo: { type: 'object' },
        },
      });

      // rename Foo → Bar, then rename Bar → Baz
      applyTransforms(spec, [
        { type: 'rename_schema', from: 'Foo', to: 'Bar' },
        { type: 'rename_schema', from: 'Bar', to: 'Baz' },
      ]);

      expect(spec.schemas['Baz']).toBeDefined();
      expect(spec.schemas['Bar']).toBeUndefined();
      expect(spec.schemas['Foo']).toBeUndefined();
    });
  });
});
