// ─── @ironic/core ────────────────────────────────────────────────────────────
// Public API: parse(), plan(), and all the types you need.

import type { IR } from './ir/types.js';
import type { IronicConfig } from './parser/config.schema.js';
import type { ParsedSpec } from './parser/openapi.js';
import { parseConfig, defaultConfig } from './parser/config.js';
import { parseOpenAPI } from './parser/openapi.js';
import { planResources } from './planner/resources.js';
import { planAuth } from './planner/auth.js';
import { planPagination } from './planner/pagination.js';
import { collectTypes } from './planner/types.js';
import { pascalCase, upperSnakeCase } from './utils/naming.js';

// ── Re-exports ──

export { parseConfig, defaultConfig } from './parser/config.js';
export { parseOpenAPI } from './parser/openapi.js';
export type { ParsedSpec } from './parser/openapi.js';
export type { IronicConfig } from './parser/config.schema.js';
export { ConfigSchema } from './parser/config.schema.js';
export { IronicUserError, IronicInternalError } from './errors.js';

// IR types
export type {
  IR,
  IRMeta,
  AuthModel,
  ResourceNode,
  MethodNode,
  ParamNode,
  TypeDef,
  TypeRef,
  PrimitiveTypeRef,
  ObjectTypeRef,
  ArrayTypeRef,
  RecordTypeRef,
  RefTypeRef,
  EnumTypeRef,
  UnionTypeRef,
  IntersectionTypeRef,
  NullableTypeRef,
  PaginationScheme,
} from './ir/types.js';

// Utils
export {
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  upperSnakeCase,
  safeIdentifier,
  singularize,
  pluralize,
} from './utils/naming.js';
export {
  stripVersionPrefix,
  splitPathSegments,
  isPathParam,
  extractParamName,
  getResourceSegments,
  getGroupKey,
  inferMethodName,
} from './utils/paths.js';
export { schemaToTypeRef } from './utils/schema.js';

// Planner
export { planResources } from './planner/resources.js';
export { planAuth } from './planner/auth.js';
export { planPagination } from './planner/pagination.js';
export { planMethod } from './planner/methods.js';
export { collectTypes } from './planner/types.js';

// ── High-level API ──

/**
 * Parse both the config file and the OpenAPI spec.
 */
export async function parse(configPath: string): Promise<{
  config: IronicConfig;
  spec: ParsedSpec;
}> {
  const config = parseConfig(configPath);
  const spec = await parseOpenAPI(config.spec);
  return { config, spec };
}

/**
 * Build the full IR from parsed config + spec.
 */
export function plan(config: IronicConfig, spec: ParsedSpec): IR {
  const resources = planResources(config, spec);
  const auth = planAuth(config, spec);
  const paginationSchemes = planPagination(config);
  const types = collectTypes(resources, spec, config);

  // Derive meta from config + spec
  const packageName = config.targets.typescript?.package_name ?? 'my-sdk';
  // Strip scope, strip -sdk or sdk suffix, use spec title or org name as fallback
  let baseName = packageName.replace(/^@([^/]+)\//, (_, scope) => {
    // If package is just "@scope/sdk", use the scope as the name
    return '';
  }).replace(/[-_]?sdk$/i, '');

  // If stripping left us empty (e.g. "@petstore/sdk" → ""), use the scope
  if (!baseName) {
    const scopeMatch = packageName.match(/^@([^/]+)\//);
    baseName = scopeMatch?.[1] ?? spec.info.title.replace(/\s+API$/i, '') ?? 'My';
  }
  const baseURL =
    config.client_settings?.base_url ??
    spec.servers[0]?.url ??
    'https://api.example.com';

  const meta = {
    packageName,
    prettyName: pascalCase(baseName),
    version: spec.info.version,
    description: spec.info.description ?? `${pascalCase(baseName)} SDK`,
    baseURL,
    environments: config.client_settings?.environments ?? {},
    defaultEnvironment: config.client_settings?.default_environment,
    timeoutMs: config.client_settings?.timeout_ms ?? 60000,
    maxRetries: config.client_settings?.max_retries ?? 2,
    userAgentPrefix: config.client_settings?.user_agent_prefix,
  };

  return { meta, auth, resources, types, paginationSchemes };
}

/**
 * Full pipeline: parse → plan → IR.
 */
export async function generate(configPath: string): Promise<IR> {
  const { config, spec } = await parse(configPath);
  return plan(config, spec);
}
