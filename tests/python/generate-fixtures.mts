import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigSchema, plan, type ParsedSpec } from '../../packages/core/src/index.js';
import { emit } from '../../packages/generator-python/src/index.js';
import { planMethod } from '../../packages/core/src/planner/methods.js';
import { collectTypes } from '../../packages/core/src/planner/types.js';
import type { OperationObject } from 'openapi3-ts/oas31';

for (const kind of ['bearer', 'basic', 'header', 'query', 'cookie', 'none']) {
  const config = ConfigSchema.parse({
    targets: { python: { package_name: 'acme-sdk' } },
    security: kind === 'none' ? [] : [{ Auth: [] }],
    security_schemes: kind === 'none' ? {} : { Auth: ['header', 'query', 'cookie'].includes(kind)
      ? { type: 'apiKey', name: 'custom_key', in: kind }
      : { type: 'http', scheme: kind } },
  });
  const ir = plan(config, {
    raw: {}, info: { title: 'Acme', version: '1.0.0' }, servers: [], paths: {},
    schemas: {}, schemaRegistry: new Map(), securitySchemes: {},
  } as ParsedSpec);
  for (const [name, content] of emit(ir, { moduleName: `auth_${kind}` })) {
    // Scaffolding is identical across fixtures; only the importable package is needed.
    if (!name.startsWith(`auth_${kind}/`)) continue;
    const path = resolve('tests/python/generated', name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

const wireConfig = ConfigSchema.parse({ targets: { python: { package_name: 'acme-sdk' } }, security: [] });
const wireSpec = {
  raw: {}, info: { title: 'Acme', version: '1.0.0' }, servers: [], paths: {},
  schemas: {}, schemaRegistry: new Map(), securitySchemes: {},
} as ParsedSpec;
const wireIR = plan(wireConfig, wireSpec);
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
wireIR.resources.push({ name: 'wire', className: 'Wire', methods: [send, download, upload, lookup], children: [] });
wireIR.types = collectTypes(wireIR.resources, wireSpec, wireConfig);
for (const [name, content] of emit(wireIR, { moduleName: 'wire_fixture' })) {
  if (!name.startsWith('wire_fixture/')) continue;
  const target = resolve('tests/python/generated', name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
