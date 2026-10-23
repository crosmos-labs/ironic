import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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

  const httpMcp = resolve(temporary, 'http-mcp');
  writeFiles(httpMcp, emitMcp(ir, { packageName: '@petstore/custom-mcp', transport: 'http' }));
  if (JSON.parse(readFileSync(resolve(httpMcp, 'package.json'), 'utf8')).name !== '@petstore/custom-mcp') {
    throw new Error('Configured MCP package name was ignored');
  }
  const httpModules = resolve(httpMcp, 'node_modules');
  for (const name of ['@modelcontextprotocol/sdk', '@types/node', 'typescript', 'zod']) {
    linkPackage(httpModules, name, resolve(nodeModules, name));
  }
  linkPackage(httpModules, '@petstore/sdk', sdk);
  execFileSync(resolve(nodeModules, '.bin/tsc'), ['-p', httpMcp], { cwd: repo, stdio: 'inherit' });

  const portServer = createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const address = portServer.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve an HTTP port');
  const port = address.port;
  portServer.close();
  await once(portServer, 'close');
  const httpProcess = spawn(process.execPath, [resolve(httpMcp, 'dist/index.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PETSTORE_API_KEY: 'test' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverOutput = '';
  httpProcess.stderr.on('data', (chunk: Buffer) => { serverOutput += chunk.toString(); });
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (httpProcess.exitCode !== null) throw new Error(`HTTP MCP server exited: ${serverOutput}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/missing`);
        if (response.status === 404) break;
      } catch { /* wait for the listener */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 49) throw new Error(`HTTP MCP server did not start: ${serverOutput}`);
    }
    const httpClient = new Client({ name: 'ironic-http-validation', version: '1.0.0' });
    try {
      await httpClient.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
      const tools = await httpClient.listTools();
      if (!tools.tools.some((tool) => tool.name === 'search_docs')) throw new Error('HTTP MCP tools are missing');
      const result = await httpClient.callTool({ name: 'search_docs', arguments: { query: 'pets', limit: 1 } });
      if (result.isError || !JSON.stringify(result.content).includes('client.pets')) throw new Error('HTTP MCP tool call failed');
    } finally {
      await httpClient.close();
    }
  } finally {
    httpProcess.kill();
    if (httpProcess.exitCode === null) await once(httpProcess, 'exit');
  }

  const configured = readFileSync(resolve(repo, 'examples/petstore/ironic.yml'), 'utf8')
    .replace('spec: ./openapi.yaml', `spec: ${resolve(repo, 'examples/petstore/openapi.yaml')}`)
    .replace('package_name: "@petstore/mcp"', 'package_name: "@petstore/cli-mcp"')
    .replace('output_dir: ./generated/mcp', 'output_dir: ./cli-mcp\n      transport: http');
  const configPath = resolve(temporary, 'ironic.yml');
  writeFileSync(configPath, configured);
  execFileSync(resolve(nodeModules, '.bin/tsx'), [resolve(repo, 'packages/cli/src/index.ts'),
    'generate', '-c', configPath, '-t', 'mcp'], { cwd: temporary, stdio: 'pipe' });
  const cliPackage = JSON.parse(readFileSync(resolve(temporary, 'cli-mcp/package.json'), 'utf8'));
  const cliEntry = readFileSync(resolve(temporary, 'cli-mcp/src/index.ts'), 'utf8');
  if (cliPackage.name !== '@petstore/cli-mcp' || !cliEntry.includes('StreamableHTTPServerTransport')) {
    throw new Error('CLI ignored MCP package name or HTTP transport');
  }
  process.stdout.write('Generated TypeScript, Python, and MCP packages validated.\n');
}

try {
  await main();
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
