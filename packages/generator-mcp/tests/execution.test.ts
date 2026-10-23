import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { parse, plan } from '@ironic/core';
import { emit } from '../src/index.js';

describe('generated MCP execution worker', () => {
  it('runs typed async code and terminates stalled and looping work', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'ironic-mcp-exec-'));
    try {
      const { config, spec } = await parse(resolve(import.meta.dirname, '../../../examples/petstore/ironic.yml'));
      for (const [name, content] of emit(plan(config, spec))) {
        if (!name.endsWith('.ts')) continue;
        const path = resolve(root, name.replace(/\.ts$/, '.js'));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, ts.transpileModule(content, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText);
      }
      writeFileSync(resolve(root, 'package.json'), '{"type":"module"}');
      mkdirSync(resolve(root, 'node_modules/@petstore/sdk'), { recursive: true });
      writeFileSync(resolve(root, 'node_modules/@petstore/sdk/package.json'), '{"type":"module","exports":"./index.js"}');
      writeFileSync(resolve(root, 'node_modules/@petstore/sdk/index.js'), 'export class PetstoreClient { async ping() { return 41; } }');
      symlinkSync(resolve('node_modules/typescript'), resolve(root, 'node_modules/typescript'));
      const script = `
        import { runInSandbox } from './src/sandbox.js';
        const value = await runInSandbox('const n: number = await client.ping(); return n + 1;', 5000);
        const failures = [];
        for (const code of ['await new Promise(() => {});', 'while (true) {}']) {
          try { await runInSandbox(code, 200); }
          catch (error) { failures.push(error.message); }
        }
        console.log(JSON.stringify({ value, failures }));
      `;
      writeFileSync(resolve(root, 'runner.js'), script);
      const result = execFileSync(process.execPath, ['runner.js'], {
        cwd: root, encoding: 'utf8', timeout: 10_000,
      });
      expect(JSON.parse(result)).toEqual({ value: 42, failures: ['Execution timed out', 'Execution timed out'] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
