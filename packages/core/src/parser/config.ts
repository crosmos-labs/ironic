// ─── Config Parser ───────────────────────────────────────────────────────────
// Loads, validates, and normalizes ironic.yml.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import yaml from 'js-yaml';
import { ConfigSchema, type IronicConfig } from './config.schema.js';
import { IronicUserError } from '../errors.js';

/**
 * Parse and validate an ironic.yml config file.
 * @param configPath - Absolute or relative path to ironic.yml
 * @returns Validated config object
 */
export function parseConfig(configPath: string): IronicConfig {
  const absPath = resolve(configPath);

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

  // Resolve spec path relative to config file
  const config = result.data;
  const configDir = dirname(absPath);
  config.spec = resolve(configDir, config.spec);

  return config;
}

/**
 * Create a default config for `ironic init`.
 */
export function defaultConfig(): string {
  return `# ironic.yml
version: 1
spec: ./openapi.yaml
targets:
  typescript:
    package_name: "my-sdk"
    output_dir: ./generated/typescript
    mcp_server:
      package_name: "my-mcp"
      output_dir: ./generated/mcp
client_settings:
  base_url: https://api.example.com
  auth:
    type: bearer
    env_var: MY_API_KEY
`;
}
