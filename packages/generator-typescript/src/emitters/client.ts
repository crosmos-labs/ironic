// ─── Client Emitter ──────────────────────────────────────────────────────────
// Emit the main SDK client class.

import type { IR, ResourceNode } from '@ironic/core';
import { joinBlocks } from '../snippets/formatters.js';

/**
 * Emit the main client.ts file.
 */
export function emitClientFile(ir: IR): string {
  const imports = buildImports(ir);
  const clientClass = buildClientClass(ir);
  const optionsType = buildOptionsType(ir);

  return joinBlocks(imports, optionsType, clientClass) + '\n';
}

function buildImports(ir: IR): string {
  const lines: string[] = [
    `import { BaseClient } from './core/api-client.js';`,
    `import type { ClientOptions } from './core/types.js';`,
  ];

  // Import each top-level resource
  for (const resource of ir.resources) {
    if (resource.children.length > 0) {
      lines.push(
        `import { ${resource.className} } from './resources/${resource.name}/index.js';`,
      );
    } else {
      lines.push(
        `import { ${resource.className} } from './resources/${resource.name}.js';`,
      );
    }
  }

  return lines.join('\n');
}

function buildOptionsType(ir: IR): string {
  const envLines: string[] = [];

  if (ir.auth.type !== 'none') {
    envLines.push(`  /** API key. Defaults to \`process.env['${ir.auth.envVar}']\`. */`);
    envLines.push(`  apiKey?: string;`);
  }

  if (Object.keys(ir.meta.environments).length > 0) {
    const envNames = Object.keys(ir.meta.environments)
      .map((e) => `'${e}'`)
      .join(' | ');
    envLines.push(`  /** Named environment. */`);
    envLines.push(`  environment?: ${envNames};`);
  }

  return `export interface ${ir.meta.prettyName}ClientOptions extends ClientOptions {
${envLines.join('\n')}
}`;
}

function buildClientClass(ir: IR): string {
  const resourceDecls = ir.resources
    .map((r) => `  ${r.name}: ${r.className};`)
    .join('\n');

  const resourceInits = ir.resources
    .map((r) => `    this.${r.name} = new ${r.className}(this);`)
    .join('\n');

  const apiKeyDefault = ir.auth.type !== 'none'
    ? `options.apiKey ?? process.env['${ir.auth.envVar}'] ?? ''`
    : `options.apiKey ?? ''`;

  const baseURLDefault = ir.meta.baseURL
    ? `options.baseURL ?? '${ir.meta.baseURL}'`
    : `options.baseURL ?? ''`;

  // Environment resolution
  let envResolution = '';
  if (Object.keys(ir.meta.environments).length > 0) {
    const envMap = Object.entries(ir.meta.environments)
      .map(([key, url]) => `      '${key}': '${url}',`)
      .join('\n');
    envResolution = `
    const environments: Record<string, string> = {
${envMap}
    };
    const baseURL = opts.environment
      ? environments[opts.environment] ?? '${ir.meta.baseURL}'
      : '${ir.meta.baseURL}';`;
  }

  return `/**
 * ${ir.meta.description}
 */
export class ${ir.meta.prettyName}Client extends BaseClient {
${resourceDecls}

  constructor(options: ${ir.meta.prettyName}ClientOptions = {}) {
    const opts = options as ${ir.meta.prettyName}ClientOptions & { environment?: string };${envResolution}
    super({
      baseURL: ${envResolution ? 'baseURL' : baseURLDefault},
      apiKey: ${apiKeyDefault},
      maxRetries: options.maxRetries ?? ${ir.meta.maxRetries},
      timeout: options.timeout ?? ${ir.meta.timeoutMs},
      ...options,
    });
${resourceInits}
  }
}`;
}
