// ─── Config Parser ───────────────────────────────────────────────────────────
// Loads, validates, and normalizes a Stainless-shaped config file.
// Accepts either ironic.yml or stainless.yml (same schema).

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { ConfigSchema, type IronicConfig } from './config.schema.js';
import { IronicUserError } from '../errors.js';

/**
 * Parse and validate a config file.
 * @param configPath - Absolute or relative path to ironic.yml / stainless.yml
 */
export function parseConfig(configPath: string): IronicConfig {
  const absPath = resolve(configPath);
  const configDir = dirname(absPath);

  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch (err) {
    throw new IronicUserError(
      'CONFIG_NOT_FOUND',
      `Could not read config file: ${absPath}`,
      absPath,
    );
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new IronicUserError(
      'CONFIG_INVALID_YAML',
      `Invalid YAML in config file: ${err instanceof Error ? err.message : String(err)}`,
      absPath,
    );
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new IronicUserError(
      'CONFIG_VALIDATION',
      `Config validation failed:\n${issues}`,
      absPath,
    );
  }

  const config = result.data;

  // Resolve the OpenAPI spec path:
  //   1. If explicitly set, resolve relative to the config file.
  //   2. Otherwise auto-discover openapi.json / openapi.yaml / openapi.yml in
  //      the config directory (matches Stainless's implicit convention).
  if (config.spec) {
    config.spec = resolve(configDir, config.spec);
  } else {
    for (const candidate of ['openapi.json', 'openapi.yaml', 'openapi.yml']) {
      const p = join(configDir, candidate);
      if (existsSync(p)) {
        config.spec = p;
        break;
      }
    }
  }

  return config;
}

/**
 * Create a default config for `ironic init`. Stainless-shaped.
 */
export function defaultConfig(): string {
  return `# ironic.yml — Stainless-compatible config
edition: 2026-02-23

organization:
  name: example

spec: ./openapi.yaml

targets:
  typescript:
    package_name: "@example/sdk"
    output_dir: ./generated/typescript
    mcp_server:
      package_name: "@example/mcp"
      output_dir: ./generated/mcp

environments:
  production: https://api.example.com

client_settings:
  opts:
    api_key:
      type: string
      auth:
        security_scheme: HTTPBearer
      read_env: EXAMPLE_API_KEY

security:
  - HTTPBearer: []

security_schemes:
  HTTPBearer:
    type: http
    scheme: bearer
`;
}
