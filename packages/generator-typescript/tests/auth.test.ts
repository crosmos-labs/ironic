import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { ConfigSchema, plan, type ParsedSpec } from '@ironic/core';
import { emit } from '../src/index.js';

describe('generated client authentication on the wire', () => {
  it.each(['bearer', 'basic', 'header', 'query', 'cookie', 'none'])(
    'sends %s authentication and honors request overrides', (kind) => {
      const root = mkdtempSync(resolve(tmpdir(), 'ironic-auth-'));
      try {
        const scheme = ['header', 'query', 'cookie'].includes(kind)
          ? { type: 'apiKey', in: kind, name: 'custom_key' }
          : { type: 'http', scheme: kind };
        const config = ConfigSchema.parse({
          targets: { typescript: { package_name: 'acme-sdk' } },
          security: kind === 'none' ? [] : [{ Auth: [] }],
          security_schemes: kind === 'none' ? {} : { Auth: scheme },
          client_settings: { opts: kind === 'basic' ? {
            user: { auth: { security_scheme: 'Auth', role: 'username' }, read_env: 'TEST_USER' },
            pass: { auth: { security_scheme: 'Auth', role: 'password' }, read_env: 'TEST_PASSWORD' },
          } : { workspace: { type: 'string' } } },
        });
        const ir = plan(config, {
          raw: {}, info: { title: 'Acme', version: '1.0.0' }, servers: [],
          paths: {}, schemas: {}, schemaRegistry: new Map(), securitySchemes: {},
        } as ParsedSpec);
        for (const [name, content] of emit(ir)) {
          const target = resolve(root, name.replace(/\.ts$/, '.js'));
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, name.endsWith('.ts') ? ts.transpileModule(content, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
          }).outputText : content);
        }
        const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
          import { AcmeClient } from ${JSON.stringify(pathToFileURL(resolve(root, 'src/client.js')).href)};
          const requests = [];
          const client = new AcmeClient({
            apiKey: 'secret value',
            fetch: async (url, init) => {
              requests.push({ url, headers: Object.fromEntries(new Headers(init.headers)) });
              return new Response('{}');
            },
          });
          await client.get('/check', { headers: { Cookie: 'session=existing' } });
          await client.get('/check', { headers: { Authorization: 'Custom override', custom_key: 'override' } });
          console.log(JSON.stringify(requests));
        `], { encoding: 'utf8', env: { ...process.env, TEST_USER: 'alïce', TEST_PASSWORD: 'secret' } });
        const [first, second] = JSON.parse(result);
        const url = new URL(first.url);
        if (kind === 'bearer') expect(first.headers.authorization).toBe('Bearer secret value');
        else if (kind === 'basic') {
          expect(first.headers.authorization).toBe(`Basic ${Buffer.from('alïce:secret').toString('base64')}`);
        } else expect(first.headers.authorization).toBeUndefined();
        if (kind === 'header') expect(first.headers.custom_key).toBe('secret value');
        if (kind === 'query') expect(url.searchParams.get('custom_key')).toBe('secret value');
        else expect(url.searchParams.has('custom_key')).toBe(false);
        if (kind === 'cookie') expect(first.headers.cookie).toBe('session=existing; custom_key=secret%20value');
        expect(second.headers.authorization).toBe('Custom override');
        expect(second.headers.custom_key).toBe('override');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
