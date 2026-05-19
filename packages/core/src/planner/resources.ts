// ─── Resource Planner ────────────────────────────────────────────────────────
// Map endpoints → resource tree. Two modes:
// 1. Config-driven: user provides Stainless-style `resources:` in the config
// 2. Auto-inference: derive from path segments
//
// Stainless shape (config-driven):
//   resources:
//     spaces:
//       models:
//         space: '#/components/schemas/SpaceResponse'   # local name → schema ref
//       methods:
//         list: get /api/v1/spaces                       # shorthand
//         create: post /api/v1/spaces
//       subresources:
//         drafts: { methods: ..., models: ... }

import type { OperationObject, PathItemObject, ParameterObject } from 'openapi3-ts/oas31';
import type { IronicConfig } from '../parser/config.schema.js';
import type { ParsedSpec } from '../parser/openapi.js';
import type { ResourceNode } from '../ir/types.js';
import { camelCase, pascalCase } from '../utils/naming.js';
import {
  getResourceSegments,
  inferMethodName,
  stripVersionPrefix,
  findCommonPathPrefix,
} from '../utils/paths.js';
import { planMethod } from './methods.js';
import { IronicUserError } from '../errors.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

// ── Resource shape we consume internally (post-normalization) ──────────────

type NormalizedResource = {
  /** Local resource name, e.g. "spaces" */
  name: string;
  /** name → {http, path, [overrides]} */
  methods: Map<string, NormalizedMethod>;
  /** Local model name (snake_case) → schema ref name (last segment of $ref) */
  models: Map<string, string>;
  /** child resources */
  subresources: Map<string, NormalizedResource>;
};

type NormalizedMethod = {
  httpMethod: string;
  path: string;
  pagination?: string;
  deprecated?: boolean;
  description?: string;
};

/**
 * Normalize Stainless's resource shape into our internal type. Accepts both
 * shorthand `"verb /path"` methods and object methods; accepts string-ref
 * models and object models.
 */
function normalizeResource(name: string, raw: Record<string, unknown>): NormalizedResource {
  const methods = new Map<string, NormalizedMethod>();
  if (raw.methods && typeof raw.methods === 'object') {
    for (const [methodName, methodSpec] of Object.entries(raw.methods as Record<string, unknown>)) {
      if (typeof methodSpec === 'string') {
        const [httpMethod, path] = parseVerbPath(methodSpec);
        methods.set(methodName, { httpMethod, path });
      } else if (methodSpec && typeof methodSpec === 'object') {
        const obj = methodSpec as Record<string, unknown>;
        const endpoint = (obj.endpoint as string | undefined) ?? '';
        const [httpMethod, path] = parseVerbPath(endpoint);
        methods.set(methodName, {
          httpMethod,
          path,
          pagination: obj.paginated ? 'cursor' : (obj.pagination as string | undefined),
          deprecated: obj.deprecated as boolean | undefined,
          description: obj.description as string | undefined,
        });
      }
    }
  }

  const models = new Map<string, string>();
  if (raw.models && typeof raw.models === 'object') {
    for (const [localName, modelSpec] of Object.entries(raw.models as Record<string, unknown>)) {
      let ref: string | undefined;
      if (typeof modelSpec === 'string') ref = modelSpec;
      else if (modelSpec && typeof modelSpec === 'object') {
        ref = (modelSpec as Record<string, unknown>).openapi_uri as string | undefined;
      }
      if (!ref) continue;
      const schemaName = extractSchemaName(ref);
      if (schemaName) models.set(localName, schemaName);
    }
  }

  const subresources = new Map<string, NormalizedResource>();
  if (raw.subresources && typeof raw.subresources === 'object') {
    for (const [subName, subRaw] of Object.entries(raw.subresources as Record<string, unknown>)) {
      if (subRaw && typeof subRaw === 'object') {
        subresources.set(subName, normalizeResource(subName, subRaw as Record<string, unknown>));
      }
    }
  }

  return { name, methods, models, subresources };
}

function parseVerbPath(input: string): [string, string] {
  const match = input.match(/^(get|post|put|patch|delete)\s+(\/\S*)/i);
  if (!match) {
    throw new IronicUserError(
      'INVALID_METHOD_PATH',
      `Invalid method endpoint: "${input}". Expected "verb /path".`,
    );
  }
  return [match[1]!.toLowerCase(), match[2]!];
}

function extractSchemaName(ref: string): string | undefined {
  const m = ref.match(/^#\/components\/schemas\/([^/]+)$/);
  if (!m) return undefined;
  return m[1];
}

/**
 * Compute the emitted class name for a resource. If any local model in this
 * resource's `models:` block PascalCases to the same name as the resource
 * itself (e.g. `search` resource with a `search` model → both `Search`), the
 * class is suffixed with `Resource` to avoid the TS name collision — matching
 * Stainless's convention (`SearchResource`, `UsageResource`).
 */
function resourceClassName(resourceName: string, raw: Record<string, unknown> | undefined): string {
  const base = pascalCase(resourceName);
  if (!raw || typeof raw !== 'object') return base;
  const models = (raw.models ?? {}) as Record<string, unknown>;
  for (const modelLocalName of Object.keys(models)) {
    if (pascalCase(modelLocalName) === base) return `${base}Resource`;
  }
  return base;
}

/**
 * Walk Stainless's resources block (with subresources) and return the union of
 * model rename mappings: `OriginalSchemaName → LocalModelPascalCase`.
 * e.g. `SpaceResponse → Space`, `SpaceListResponse → SpaceList`.
 */
export function collectModelRenames(config: IronicConfig): Record<string, string> {
  const renames: Record<string, string> = {};
  if (!config.resources) return renames;
  const walk = (defs: Record<string, unknown>) => {
    for (const [resourceName, raw] of Object.entries(defs)) {
      if (!raw || typeof raw !== 'object') continue;
      const norm = normalizeResource(resourceName, raw as Record<string, unknown>);
      for (const [localName, schemaName] of norm.models) {
        renames[schemaName] = pascalCase(localName);
      }
      const subRaw = (raw as Record<string, unknown>).subresources;
      if (subRaw && typeof subRaw === 'object') walk(subRaw as Record<string, unknown>);
    }
  };
  walk(config.resources as Record<string, unknown>);
  return renames;
}

/**
 * Predict the resource class names that planResources() will produce, without
 * walking schemas. Used by the type rename pass to avoid colliding a renamed
 * schema with a resource class of the same name.
 */
export function predictResourceClassNames(
  config: IronicConfig,
  spec: ParsedSpec,
): string[] {
  const names = new Set<string>();

  if (config.resources) {
    const walk = (defs: Record<string, unknown>) => {
      for (const [name, raw] of Object.entries(defs)) {
        names.add(resourceClassName(name, raw as Record<string, unknown> | undefined));
        if (raw && typeof raw === 'object') {
          const subs = (raw as Record<string, unknown>).subresources;
          if (subs && typeof subs === 'object') walk(subs as Record<string, unknown>);
        }
      }
    };
    walk(config.resources as Record<string, unknown>);
    return [...names];
  }

  const prefix = findCommonPathPrefix(Object.keys(spec.paths));
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const httpMethod of HTTP_METHODS) {
      if (!(pathItem as Record<string, unknown>)[httpMethod]) continue;
      const segments = getResourceSegments(path, prefix);
      if (segments[0]) names.add(pascalCase(segments[0]));
      if (segments[1]) names.add(pascalCase(segments[1]));
    }
  }
  return [...names];
}

/**
 * Build the resource tree from config + spec.
 */
export function planResources(
  config: IronicConfig,
  spec: ParsedSpec,
): ResourceNode[] {
  if (config.resources) {
    return planFromConfig(config, spec);
  }
  return planFromInference(spec, config);
}

// ── Config-driven resource tree ──

function planFromConfig(
  config: IronicConfig,
  spec: ParsedSpec,
): ResourceNode[] {
  const resources: ResourceNode[] = [];

  for (const [name, raw] of Object.entries(config.resources!).sort(([a], [b]) => a.localeCompare(b))) {
    if (!raw || typeof raw !== 'object') continue;
    const rawObj = raw as Record<string, unknown>;
    const norm = normalizeResource(name, rawObj);
    const className = resourceClassName(name, rawObj);
    resources.push(buildConfigResource(norm, spec, config, className));
  }

  return resources;
}

function buildConfigResource(
  norm: NormalizedResource,
  spec: ParsedSpec,
  config: IronicConfig,
  className: string,
): ResourceNode {
  const node: ResourceNode = {
    name: camelCase(norm.name),
    className,
    methods: [],
    children: [],
  };

  // Build methods (sorted by method name for stable output)
  const sortedMethods = [...norm.methods.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [methodName, methodDef] of sortedMethods) {
    const operation = findOperation(spec, methodDef.httpMethod, methodDef.path);
    if (!operation) {
      throw new IronicUserError(
        'RESOURCE_PATH_NOT_FOUND',
        `Endpoint "${methodDef.httpMethod} ${methodDef.path}" not found in spec. Check your resources config.`,
      );
    }

    node.methods.push(
      planMethod(camelCase(methodName), methodDef.httpMethod, methodDef.path, operation, {
        pagination: methodDef.pagination,
        deprecated: methodDef.deprecated,
        descriptionOverride: methodDef.description,
      }, spec.schemaRegistry),
    );
  }

  // Build children (use the same collision-aware naming for subresources)
  for (const [, child] of [...norm.subresources.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Subresources don't share their raw object here; use the simple base name
    // until we have a need for the collision rule at child depth.
    node.children.push(buildConfigResource(child, spec, config, pascalCase(child.name)));
  }

  return node;
}

// ── Auto-inference ──

function planFromInference(
  spec: ParsedSpec,
  config: IronicConfig,
): ResourceNode[] {
  const prefix = findCommonPathPrefix(Object.keys(spec.paths));

  const groups = new Map<string, { httpMethod: string; path: string; operation: OperationObject; segments: string[] }[]>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const httpMethod of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[httpMethod] as OperationObject | undefined;
      if (!operation) continue;

      const segments = getResourceSegments(path, prefix);
      const groupKey = segments[0] ?? '_root';

      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push({ httpMethod, path, operation, segments });
    }
  }

  const resources: ResourceNode[] = [];

  for (const [groupKey, ops] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (groupKey === '_root') continue;

    const secondSegments = new Set(
      ops.map((op) => op.segments[1]).filter((s): s is string => s !== undefined),
    );

    if (secondSegments.size > 1) {
      const resource: ResourceNode = {
        name: camelCase(groupKey),
        className: pascalCase(groupKey),
        methods: [],
        children: [],
      };

      const subGroups = new Map<string, typeof ops>();
      for (const op of ops) {
        const subKey = op.segments[1];
        if (!subKey) {
          resource.methods.push(...buildMethods([op], spec.schemaRegistry, config, prefix, 1));
          continue;
        }
        if (!subGroups.has(subKey)) subGroups.set(subKey, []);
        subGroups.get(subKey)!.push(op);
      }

      for (const [subKey, subOps] of [...subGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const child: ResourceNode = {
          name: camelCase(subKey),
          className: pascalCase(subKey),
          methods: buildMethods(subOps, spec.schemaRegistry, config, prefix, 2),
          children: [],
        };
        resource.children.push(child);
      }

      resources.push(resource);
    } else {
      resources.push({
        name: camelCase(groupKey),
        className: pascalCase(groupKey),
        methods: buildMethods(ops, spec.schemaRegistry, config, prefix, 1),
        children: [],
      });
    }
  }

  return resources;
}

function isAutoGeneratedOperationId(opId: string, httpMethod: string): boolean {
  const suffix = `_${httpMethod.toLowerCase()}`;
  if (!opId.toLowerCase().endsWith(suffix)) return false;
  const underscoreCount = (opId.match(/_/g) ?? []).length;
  return underscoreCount >= 3;
}

function buildMethods(
  ops: { httpMethod: string; path: string; operation: OperationObject }[],
  schemaRegistry?: Map<object, string>,
  config?: IronicConfig,
  prefix?: string,
  resourceDepth?: number,
): ReturnType<typeof planMethod>[] {
  return ops
    .map((op) => {
      const opId = op.operation.operationId;
      const methodName = opId && !isAutoGeneratedOperationId(opId, op.httpMethod)
        ? camelCase(opId.split('.').pop() ?? opId)
        : inferMethodName(op.httpMethod, op.path, prefix, resourceDepth);

      const pagination = detectPagination(op.httpMethod, op.operation, config);

      return planMethod(methodName, op.httpMethod, op.path, op.operation, pagination ? { pagination } : undefined, schemaRegistry);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Detect if an operation matches a Stainless-configured or heuristically-inferred
 * pagination scheme.
 *
 * Priority: explicit config match → heuristic match.
 * Heuristics (Tier 4):
 *   - `limit`+`offset` query AND response has `count`/`total` → offset
 *   - `after`/`cursor`+`limit` query AND response has `has_more`/`next_cursor` → cursor
 *   - response has `next_cursor` AND an array field → cursor
 */
function detectPagination(
  httpMethod: string,
  operation: OperationObject,
  config?: IronicConfig,
): string | undefined {
  if (httpMethod.toLowerCase() !== 'get') return undefined;

  const params = (operation.parameters ?? []) as ParameterObject[];
  const queryNames = new Set(
    params.filter((p) => p.in === 'query').map((p) => p.name),
  );

  // ── Explicit Stainless config match (single object or array of schemes) ──
  if (config?.pagination) {
    const schemes = Array.isArray(config.pagination) ? config.pagination : [config.pagination];
    for (const scheme of schemes) {
      const s = scheme as { type?: string; request?: Record<string, unknown> };
      const req = s.request ?? {};
      if (s.type === 'cursor' || s.type === 'cursor_id' || s.type === 'cursor_url') {
        const cursorParam = (req.cursor_param as string) ?? 'after';
        if (queryNames.has(cursorParam)) return 'cursor';
      } else if (s.type === 'offset' || s.type === 'page_number') {
        const pageParam = (req.page_param as string) ?? (req.offset_param as string) ?? 'page';
        if (queryNames.has(pageParam)) return 'offset';
      }
    }
  }

  // ── Heuristic match ──
  const responseProps = getResponseProperties(operation);

  if (
    queryNames.has('limit') &&
    queryNames.has('offset') &&
    (responseProps.has('count') || responseProps.has('total'))
  ) {
    return 'offset';
  }

  const hasCursorParam = queryNames.has('after') || queryNames.has('cursor');
  const hasCursorResponse = responseProps.has('has_more') || responseProps.has('next_cursor');
  if (hasCursorParam && queryNames.has('limit') && hasCursorResponse) {
    return 'cursor';
  }

  if (responseProps.has('next_cursor') && hasArrayField(operation)) {
    return 'cursor';
  }

  return undefined;
}

function getResponseProperties(operation: OperationObject): Set<string> {
  const responses = operation.responses ?? {};
  const successCode =
    Object.keys(responses).find((c) => c === '200') ??
    Object.keys(responses).find((c) => c === '201') ??
    Object.keys(responses).find((c) => c.startsWith('2'));
  if (!successCode) return new Set();

  const response = responses[successCode] as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, { schema?: Record<string, unknown> }> | undefined;
  const schema = content?.['application/json']?.schema;
  if (!schema || typeof schema !== 'object') return new Set();

  const props = (schema as Record<string, unknown>).properties;
  if (!props || typeof props !== 'object') return new Set();
  return new Set(Object.keys(props as object));
}

function hasArrayField(operation: OperationObject): boolean {
  const responses = operation.responses ?? {};
  const successCode =
    Object.keys(responses).find((c) => c === '200') ??
    Object.keys(responses).find((c) => c === '201') ??
    Object.keys(responses).find((c) => c.startsWith('2'));
  if (!successCode) return false;

  const response = responses[successCode] as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, { schema?: Record<string, unknown> }> | undefined;
  const schema = content?.['application/json']?.schema;
  if (!schema || typeof schema !== 'object') return false;

  const props = (schema as Record<string, unknown>).properties as Record<string, unknown> | undefined;
  if (!props) return false;
  return Object.values(props).some(
    (p) => typeof p === 'object' && p !== null && (p as Record<string, unknown>).type === 'array',
  );
}

// ── Helpers ──

function findOperation(
  spec: ParsedSpec,
  httpMethod: string,
  path: string,
): OperationObject | undefined {
  const pathItem = spec.paths[path] as Record<string, unknown> | undefined;
  if (pathItem) {
    return pathItem[httpMethod] as OperationObject | undefined;
  }

  // Fallback: try ignoring the version prefix
  for (const specPath of Object.keys(spec.paths)) {
    if (stripVersionPrefix(specPath) === path) {
      const item = spec.paths[specPath] as Record<string, unknown>;
      return item?.[httpMethod] as OperationObject | undefined;
    }
  }

  return undefined;
}
