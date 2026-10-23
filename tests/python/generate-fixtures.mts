import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigSchema, plan, type ParsedSpec } from '../../packages/core/src/index.js';
import { emit } from '../../packages/generator-python/src/index.js';

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
