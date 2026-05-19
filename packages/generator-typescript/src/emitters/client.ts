// ─── Client Emitter ──────────────────────────────────────────────────────────
// Emit the main SDK client class.
//
// Each entry under `client_settings.opts` in the Stainless config becomes:
//   - A property on `${Client}ClientOptions`
//   - A class field on the client (for non-auth opts)
//   - Constructor initialization with the corresponding `readEnv` fallback
//
// The single opt whose `auth.security_scheme` matches the active security
// requirement drives the AuthModel and gets routed into BaseClient's apiKey/
// username/password fields; other opts are surface only and stored as fields.

import type { IR, ClientOpt } from '@ironic/core';
import { joinBlocks, fileHeader } from '../snippets/formatters.js';

export function emitClientFile(ir: IR): string {
  const imports = buildImports(ir);
  const optionsType = buildOptionsType(ir);
  const clientClass = buildClientClass(ir);

  return joinBlocks(fileHeader(), imports, optionsType, clientClass) + '\n';
}

function buildImports(ir: IR): string {
  const lines: string[] = [
    `import { BaseClient } from './core/api-client.js';`,
    `import type { ClientOptions } from './core/types.js';`,
  ];
  if (ir.auth.type !== 'none' || (ir.meta.clientOpts ?? []).some((o) => o.readEnv)) {
    lines.push(`import { readEnv } from './core/env.js';`);
  }

  for (const resource of ir.resources) {
    if (resource.children.length > 0) {
      lines.push(`import { ${resource.className} } from './resources/${resource.name}/index.js';`);
    } else {
      lines.push(`import { ${resource.className} } from './resources/${resource.name}.js';`);
    }
  }

  return lines.join('\n');
}

function isAuthOpt(opt: ClientOpt): boolean {
  return !!opt.auth;
}

function tsTypeFor(opt: ClientOpt): string {
  const base = opt.type === 'integer' ? 'number' : opt.type;
  return opt.nullable ? `${base} | null` : base;
}

function buildOptionsType(ir: IR): string {
  const lines: string[] = [];
  const opts = ir.meta.clientOpts ?? [];

  // Render each declared opt. The auth opt becomes `apiKey?: string` (special
  // name for back-compat with BaseClient's contract); other opts use camelCase.
  for (const opt of opts) {
    if (opt.description) lines.push(`  /** ${opt.description} */`);
    else if (isAuthOpt(opt) && opt.readEnv) {
      lines.push(`  /** API key. Defaults to the ${opt.readEnv} environment variable. */`);
    }
    const fieldName = isAuthOpt(opt) ? 'apiKey' : opt.tsName;
    lines.push(`  ${fieldName}?: ${tsTypeFor(opt)};`);
  }

  // Fall back to a plain apiKey if there are no opts but auth is configured
  // (auto-inferred bearer from spec.securitySchemes).
  if (opts.length === 0 && ir.auth.type !== 'none') {
    lines.push(`  /** API key. Defaults to the ${ir.auth.envVar} environment variable. */`);
    lines.push(`  apiKey?: string;`);
  }

  if (Object.keys(ir.meta.environments).length > 0) {
    const envNames = Object.keys(ir.meta.environments).map((e) => `'${e}'`).join(' | ');
    lines.push(`  /** Named environment. */`);
    lines.push(`  environment?: ${envNames};`);
  }

  return `export interface ${ir.meta.prettyName}ClientOptions extends ClientOptions {
${lines.join('\n')}
}`;
}

function buildClientClass(ir: IR): string {
  const opts = ir.meta.clientOpts ?? [];
  const nonAuthOpts = opts.filter((o) => !isAuthOpt(o));

  const resourceDecls = ir.resources.map((r) => `  ${r.name}: ${r.className};`).join('\n');

  // Public fields for every non-auth opt.
  const optFieldDecls = nonAuthOpts.length > 0
    ? nonAuthOpts.map((o) => `  ${o.tsName}: ${tsTypeFor(o)};`).join('\n')
    : '';

  const resourceInits = ir.resources.map((r) => `    this.${r.name} = new ${r.className}(this);`).join('\n');

  const optFieldInits = nonAuthOpts
    .map((o) => `    this.${o.tsName} = ${optResolveExpr(o)};`)
    .join('\n');

  // API key resolution. Prefer the auth opt's readEnv; fall back to the inferred
  // auth env var (used when no opt was declared).
  const authOpt = opts.find(isAuthOpt);
  const apiKeyEnv = authOpt?.readEnv ?? ir.auth.envVar;
  const apiKeyExpr =
    ir.auth.type !== 'none' && apiKeyEnv
      ? `options.apiKey ?? readEnv('${apiKeyEnv}') ?? ''`
      : `options.apiKey ?? ''`;

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

  const baseURLLine = envResolution ? 'baseURL: baseURL,' : `baseURL: options.baseURL ?? '${ir.meta.baseURL}',`;

  return `/**
 * ${ir.meta.description}
 */
export class ${ir.meta.prettyName}Client extends BaseClient {
${resourceDecls}${optFieldDecls ? '\n' + optFieldDecls : ''}

  constructor(options: ${ir.meta.prettyName}ClientOptions = {}) {
    const opts = options as ${ir.meta.prettyName}ClientOptions & { environment?: string };${envResolution}
    super({
      ${baseURLLine}
      apiKey: ${apiKeyExpr},
      maxRetries: options.maxRetries ?? ${ir.meta.maxRetries},
      timeout: options.timeout ?? ${ir.meta.timeoutMs},
      ...options,
    });
${optFieldInits ? optFieldInits + '\n' : ''}${resourceInits}
  }
}`;
}

function optResolveExpr(opt: ClientOpt): string {
  const lhs = `options.${opt.tsName}`;
  const env = opt.readEnv ? `readEnv('${opt.readEnv}')` : null;
  const def = opt.default !== undefined ? JSON.stringify(opt.default) : null;
  const fallback = opt.nullable ? 'null' : opt.type === 'string' ? `''` : opt.type === 'boolean' ? 'false' : '0';

  const parts = [lhs];
  if (env) parts.push(env);
  if (def !== null) parts.push(def);
  parts.push(fallback);
  return parts.join(' ?? ');
}
