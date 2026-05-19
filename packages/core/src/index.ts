// ─── @ironic/core ────────────────────────────────────────────────────────────
// Public API: parse(), plan(), and all the types you need.

import type { IR } from './ir/types.js';
import type { IronicConfig } from './parser/config.schema.js';
import type { ParsedSpec } from './parser/openapi.js';
import { parseConfig, defaultConfig } from './parser/config.js';
import { parseOpenAPI } from './parser/openapi.js';
import { planResources, predictResourceClassNames, collectModelRenames } from './planner/resources.js';
import { planAuth } from './planner/auth.js';
import { planPagination } from './planner/pagination.js';
import { collectTypes } from './planner/types.js';
import { buildSchemaRenames } from './planner/type-naming.js';
import { applyTransforms } from './planner/transforms.js';
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
export { applyTransforms } from './planner/transforms.js';
export type { Transform } from './parser/config.schema.js';

// ── High-level API ──

/**
 * Parse both the config file and the OpenAPI spec.
 */
export async function parse(configPath: string): Promise<{
  config: IronicConfig;
  spec: ParsedSpec;
}> {
  const config = parseConfig(configPath);
  if (!config.spec) {
    throw new Error(
      'No OpenAPI spec path found. Set `spec: ./openapi.yaml` in your config, ' +
        'or place an `openapi.json`/`openapi.yaml` next to the config file.',
    );
  }
  const spec = await parseOpenAPI(config.spec);
  return { config, spec };
}

/**
 * Build the full IR from parsed config + spec.
 */
export function plan(config: IronicConfig, spec: ParsedSpec): IR {
  // 0. Apply user-declared transforms (spec mutation) before any planning.
  //    Transforms run in declaration order and are purely spec → spec.
  if (config.transforms && config.transforms.length > 0) {
    applyTransforms(spec, config.transforms);
  }

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
  // Environments now live at the top level (Stainless shape). Pick a sensible
  // default for the baseURL: prefer `production`, else first declared env,
  // else the spec's first server, else a generic placeholder.
  const environments = config.environments ?? {};
  const defaultEnvironment =
    'production' in environments ? 'production' : Object.keys(environments)[0];
  const baseURL =
    (defaultEnvironment ? environments[defaultEnvironment] : undefined) ??
    spec.servers[0]?.url ??
    'https://api.example.com';

  // Timeout + retries come from `client_settings.default_timeout` / `default_retries`.
  const defaultTimeout = config.client_settings?.default_timeout;
  const timeoutMs =
    typeof defaultTimeout === 'number'
      ? defaultTimeout
      : (defaultTimeout as { value?: number } | undefined)?.value ?? 60000;

  // Example requests from config.readme — surface as a stable array on the IR.
  const exampleRequests = config.readme?.example_requests
    ? Object.entries(config.readme.example_requests).map(([name, ex]) => ({
        name,
        endpoint: ex.endpoint,
        params: ex.params,
        responseProperty: ex.response_property,
        assignTo: ex.assign_to,
      }))
    : undefined;

  const meta = {
    packageName,
    prettyName: pascalCase(baseName),
    version: spec.info.version,
    description: spec.info.description ?? `${pascalCase(baseName)} SDK`,
    baseURL,
    environments,
    defaultEnvironment,
    timeoutMs,
    maxRetries: config.client_settings?.default_retries?.max_retries ?? 2,
    userAgentPrefix: undefined,
    license: config.settings?.license,
    organization: config.organization
      ? {
          name: config.organization.name,
          docs: config.organization.docs ?? config.organization.docs_url,
          contact: config.organization.contact ?? config.organization.contact_email,
        }
      : undefined,
    exampleRequests,
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

  // User-supplied renames come from each resource's `models:` block in
  // Stainless config (e.g. `space: '#/components/schemas/SpaceResponse'`
  // means `SpaceResponse` → `Space`). Heuristics fall back when models is empty.
  const userRenames = collectModelRenames(config);

  const renames = buildSchemaRenames(
    Object.keys(spec.schemas),
    userRenames,
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
