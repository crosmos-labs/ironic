import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parse, plan, type IR } from '../../packages/core/src/index.js';
import { emit as emitTypescript } from '../../packages/generator-typescript/src/index.js';
import { emit as emitPython } from '../../packages/generator-python/src/index.js';
import { emit as emitMcp } from '../../packages/generator-mcp/src/index.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = mkdtempSync(resolve(tmpdir(), 'ironic-generated-'));

function writeFiles(directory: string, files: Map<string, string>): void {
  for (const [relative, content] of files) {
    const target = resolve(directory, relative);
    if (!target.startsWith(`${directory}/`)) throw new Error(`Invalid generated path: ${relative}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function linkPackage(nodeModules: string, name: string, source: string): void {
  const target = resolve(nodeModules, name);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, 'dir');
}

async function main(): Promise<void> {
  const { config, spec } = await parse(resolve(repo, 'examples/petstore/ironic.yml'));
  const ir = plan(config, spec);
  const sdk = resolve(temporary, 'sdk');
  const python = resolve(temporary, 'python');
  const mcp = resolve(temporary, 'mcp');
  writeFiles(sdk, emitTypescript(ir));
  writeFiles(python, emitPython(ir, { packageName: 'petstore-sdk', moduleName: 'petstore' }));
  writeFiles(mcp, emitMcp(ir));

  const nodeModules = resolve(repo, 'node_modules');
  symlinkSync(nodeModules, resolve(sdk, 'node_modules'), 'dir');
  execFileSync(resolve(nodeModules, '.bin/tsc'), ['-p', sdk], { cwd: repo, stdio: 'inherit' });
  const sdkModule = await import(resolve(sdk, 'dist/index.js'));
  if (typeof sdkModule.PetstoreClient !== 'function') throw new Error('Generated SDK client is not importable');

  const nestedIR: IR = { ...ir, types: [], resources: [{
    name: 'widgets', className: 'Widgets', methods: [], children: [{
      name: 'parts', className: 'Parts', children: [], methods: [{
        name: 'get', httpMethod: 'get', path: '/widgets/{widget_id}/parts/{part_id}',
        pathParams: [
          { name: 'widget_id', tsName: 'widgetId', type: { kind: 'primitive', type: 'string' }, required: true },
          { name: 'part_id', tsName: 'partId', type: { kind: 'primitive', type: 'string' }, required: true },
        ],
        queryParams: [], requestBody: null, responseType: { kind: 'primitive', type: 'string' },
        streaming: false, streamOption: false, deprecated: false,
      }],
    }],
  }] };
  const nestedSdk = resolve(temporary, 'nested-sdk');
  const nestedPython = resolve(temporary, 'nested-python');
  writeFiles(nestedSdk, emitTypescript(nestedIR));
  writeFiles(nestedPython, emitPython(nestedIR, { packageName: 'nested-sdk', moduleName: 'nested' }));
  symlinkSync(nodeModules, resolve(nestedSdk, 'node_modules'), 'dir');
  execFileSync(resolve(nodeModules, '.bin/tsc'), ['-p', nestedSdk], { cwd: repo, stdio: 'inherit' });
  const nestedModule = await import(resolve(nestedSdk, 'dist/index.js'));
  if (!new nestedModule.PetstoreClient().widgets.parts) throw new Error('Nested TypeScript resource is missing');

  const mcpModules = resolve(mcp, 'node_modules');
  for (const name of ['@modelcontextprotocol/sdk', '@types/node', 'typescript', 'zod']) {
    linkPackage(mcpModules, name, resolve(nodeModules, name));
  }
  linkPackage(mcpModules, '@petstore/sdk', sdk);
  execFileSync(resolve(nodeModules, '.bin/tsc'), ['-p', mcp], { cwd: repo, stdio: 'inherit' });

  const pythonCmd = process.env.IRONIC_PYTHON ?? 'python3';
  execFileSync(pythonCmd, ['-m', 'compileall', '-q', python], { stdio: 'inherit' });
  execFileSync(pythonCmd, ['-c', 'from petstore import Petstore, AsyncPetstore; assert Petstore and AsyncPetstore'], {
    env: { ...process.env, PYTHONPATH: python }, stdio: 'inherit',
  });
  execFileSync(pythonCmd, ['-c', 'from nested import Petstore; assert Petstore().widgets.parts'], {
    env: { ...process.env, PYTHONPATH: nestedPython }, stdio: 'inherit',
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(mcp, 'dist/index.js')],
    env: { ...process.env, PETSTORE_API_KEY: 'test' },
  });
  const client = new Client({ name: 'ironic-validation', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === 'search_docs') || !tools.tools.some((tool) => tool.name === 'execute_code')) {
      throw new Error('Generated MCP tools are missing');
    }
    const docs = await client.callTool({ name: 'search_docs', arguments: { query: 'pets', limit: 1 } });
    if (docs.isError || !JSON.stringify(docs.content).includes('client.pets')) throw new Error(`MCP documentation search failed: ${JSON.stringify(docs)}`);
    const code = await client.callTool({ name: 'execute_code', arguments: { code: 'const n: number = 2; return n;' } });
    if (code.isError || !JSON.stringify(code.content).includes('2')) throw new Error('MCP TypeScript execution failed');
  } finally {
    await client.close();
  }
  process.stdout.write('Generated TypeScript, Python, and MCP packages validated.\n');
}

try {
  await main();
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
