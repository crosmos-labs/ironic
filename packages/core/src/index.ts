// ─── @ironic/core ────────────────────────────────────────────────────────────
// Public API: parse(), plan(), and all the types you need.

import type { IR } from './ir/types.js';
import type { IronicConfig } from './parser/config.schema.js';
import type { ParsedSpec } from './parser/openapi.js';
import { parseConfig, defaultConfig } from './parser/config.js';
import { parseOpenAPI } from './parser/openapi.js';
import { planResources, predictResourceClassNames } from './planner/resources.js';
import { planAuth } from './planner/auth.js';
import { planPagination } from './planner/pagination.js';
import { collectTypes } from './planner/types.js';
import { buildSchemaRenames } from './planner/type-naming.js';
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
  // Rename component schemas (SpaceResponse → Space, CreateSpaceRequest →
  // SpaceCreateParams, etc.) BEFORE planning resources, so every RefTypeRef
  // produced by the method planner already uses the final name.
  applySchemaRenames(spec, config);

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

/**
 * Rewrite the schemaRegistry in place so component schemas resolve to their
 * renamed identifiers everywhere downstream (RefTypeRefs in resource methods,
 * the type collector's emit pass, etc.). Caches the rename map on the spec
 * so `collectTypes` doesn't recompute it.
 */
function applySchemaRenames(spec: ParsedSpec, config: IronicConfig): void {
  // Reserve resource class names so e.g. SearchResponse → Search doesn't
  // collide with `export class Search extends APIResource`.
  const reserved = predictResourceClassNames(config, spec);
  const renames = buildSchemaRenames(
    Object.keys(spec.schemas),
    config.types?.rename ?? {},
    reserved,
  );

  // Update the registry: it stores object identity → final name, so we
  // walk every entry and apply the rename if the *original* PascalCased
  // name matches a rename source.
  const originals = new Map<string, string>(); // original PascalCase → rename target
  for (const [orig, target] of Object.entries(renames)) {
    originals.set(pascalCase(orig), target);
  }
  for (const [obj, currentName] of spec.schemaRegistry) {
    const renamed = originals.get(currentName);
    if (renamed) spec.schemaRegistry.set(obj, renamed);
  }

  // Stash for collectTypes (avoids recomputing + lets us emit under final names).
  (spec as ParsedSpec & { _renames?: Record<string, string> })._renames = renames;
}
