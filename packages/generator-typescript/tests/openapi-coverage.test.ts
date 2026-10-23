import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { OperationObject } from 'openapi3-ts/oas31';
import { ConfigSchema, IronicUserError, plan, type ParsedSpec } from '@ironic/core';
import { planMethod } from '../../core/src/planner/methods.js';
import { collectTypes } from '../../core/src/planner/types.js';
import { emit } from '../src/index.js';

describe('OpenAPI wire coverage', () => {
  it('generates a compiling client that sends headers, cookies, styled query and text, and reads binary', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'ironic-wire-'));
    try {
      const config = ConfigSchema.parse({ targets: { typescript: { package_name: 'acme-sdk' } }, security: [] });
      const spec = {
        raw: {}, info: { title: 'Acme', version: '1.0.0' }, servers: [], paths: {},
        schemas: {}, schemaRegistry: new Map(), securitySchemes: {},
      } as ParsedSpec;
      const ir = plan(config, spec);
      const send = planMethod('send', 'post', '/wire', {
        parameters: [
          { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'form', explode: false },
          { name: 'filter', in: 'query', schema: { type: 'object', properties: { active: { type: 'boolean' } } }, style: 'deepObject' },
          { name: 'fields', in: 'query', schema: { type: 'array', items: { type: 'string' } }, style: 'pipeDelimited' },
          { name: 'flags', in: 'query', schema: { type: 'object', properties: { enabled: { type: 'boolean' } } }, style: 'form', explode: false },
          { name: 'X-Trace', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'session', in: 'cookie', schema: { type: 'string' } },
        ],
        requestBody: { required: false, content: { 'text/plain': { schema: { type: 'string' } } } },
        responses: { '200': { description: 'ok', content: { 'text/plain': { schema: { type: 'string' } } } } },
      } as OperationObject);
      const download = planMethod('download', 'get', '/wire/download', {
        responses: { '200': { description: 'ok', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } } },
      } as OperationObject);
      const upload = planMethod('upload', 'post', '/wire/upload', {
        requestBody: { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
        responses: { '204': { description: 'uploaded' } },
      } as OperationObject);
      const lookup = planMethod('lookup', 'get', '/wire/{key}', {
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok', content: { 'text/plain': { schema: { type: 'string' } } } } },
      } as OperationObject);
      ir.resources.push({ name: 'wire', className: 'Wire', methods: [send, download, upload, lookup], children: [] });
      ir.types = collectTypes(ir.resources, spec, config);
      for (const [name, content] of emit(ir)) {
        const source = resolve(root, name);
        mkdirSync(dirname(source), { recursive: true });
        writeFileSync(source, content);
        if (name.endsWith('.ts')) {
          const target = resolve(root, name.replace(/\.ts$/, '.js'));
          writeFileSync(target, ts.transpileModule(content, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
          }).outputText);
        }
      }
      execFileSync(resolve('node_modules/.bin/tsc'), ['--noEmit', '-p', root], { stdio: 'pipe' });
      const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
        import { AcmeClient } from ${JSON.stringify(pathToFileURL(resolve(root, 'src/client.js')).href)};
        const requests = [];
        const client = new AcmeClient({ fetch: async (url, init) => {
          requests.push({ url, headers: Object.fromEntries(new Headers(init.headers)), body: init.body });
          return url.endsWith('/upload')
            ? new Response(null, { status: 204 })
            : url.endsWith('/download')
            ? new Response(Uint8Array.from([0, 255]))
            : new Response('hello');
        } });
        const text = await client.wire.send(undefined, { tags: ['a', 'b'], filter: { active: true }, fields: ['name', 'age'], flags: { enabled: true } }, {
          headers: { 'X-Trace': 'trace' }, cookies: { session: 'a b' },
        });
        const bytes = await client.wire.download();
        await client.wire.upload(Uint8Array.from([1, 2]));
        await client.wire.lookup('a/b?c');
        console.log(JSON.stringify({ requests, text, bytes: [...bytes] }));
      `], { encoding: 'utf8' });
      const output = JSON.parse(result);
      expect(output.text).toBe('hello');
      expect(output.bytes).toEqual([0, 255]);
      expect(output.requests[0].headers['x-trace']).toBe('trace');
      expect(output.requests[0].headers.cookie).toBe('session=a%20b');
      expect(output.requests[0].headers['content-type']).toBe('text/plain');
      expect(new URL(output.requests[0].url).searchParams.get('tags')).toBe('a,b');
      expect(new URL(output.requests[0].url).searchParams.get('filter[active]')).toBe('true');
      expect(new URL(output.requests[0].url).searchParams.get('fields')).toBe('name|age');
      expect(new URL(output.requests[0].url).searchParams.get('flags')).toBe('enabled,true');
      expect(output.requests[2].headers['content-type']).toBe('application/octet-stream');
      expect(output.requests[1].headers.accept).toBe('application/pdf');
      expect(Object.values(output.requests[2].body)).toEqual([1, 2]);
      expect(output.requests[3].url).toContain('/wire/a%2Fb%3Fc');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects parameter styles that cannot be serialized correctly', () => {
    expect(() => planMethod('list', 'get', '/items', {
      parameters: [{ name: 'ids', in: 'query', style: 'pipeDelimited', explode: true, schema: { type: 'array', items: { type: 'string' } } }],
      responses: { '204': { description: 'empty' } },
    } as OperationObject)).toThrow(IronicUserError);
    expect(() => planMethod('create', 'post', '/items', {
      requestBody: { content: { 'application/xml': { schema: { type: 'string' } } } },
      responses: { '204': { description: 'empty' } },
    } as OperationObject)).toThrow(IronicUserError);
  });
});
