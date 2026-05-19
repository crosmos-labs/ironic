// ─── Resource Planner ────────────────────────────────────────────────────────
// Map endpoints → resource tree. Two modes:
// 1. Config-driven: user provides `resources:` in ironic.yml
// 2. Auto-inference: derive from path segments

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

/**
 * Predict the resource class names that planResources() will produce, without
 * walking schemas. Used by the type rename pass to avoid colliding a renamed
 * schema (e.g. `SearchResponse` → `Search`) with a resource class of the same
 * name. Mirrors the inference logic in planFromInference but skips method work.
 */
export function predictResourceClassNames(
  config: IronicConfig,
  spec: ParsedSpec,
): string[] {
  const names = new Set<string>();

  if (config.resources) {
    const walk = (defs: Record<string, { children?: typeof defs }>) => {
      for (const [name, def] of Object.entries(defs)) {
        names.add(pascalCase(name));
        if (def.children) walk(def.children);
      }
    };
    walk(config.resources as Record<string, { children?: Record<string, never> }>);
    return [...names];
  }

  const prefix = resolvePathPrefix(config, Object.keys(spec.paths));
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const httpMethod of HTTP_METHODS) {
      if (!(pathItem as Record<string, unknown>)[httpMethod]) continue;
      const segments = getResourceSegments(path, prefix);
      if (segments[0]) names.add(pascalCase(segments[0]));
      // Sub-resources surface as nested classes too.
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

  for (const [name, resourceDef] of Object.entries(config.resources!).sort(([a], [b]) => a.localeCompare(b))) {
    resources.push(buildConfigResource(name, resourceDef, spec, config));
  }

  return resources;
}

function buildConfigResource(
  name: string,
  resourceDef: {
    methods?: Record<string, { path: string; pagination?: string; stream_option?: boolean; response_unwrap?: string | boolean; deprecated?: boolean; description_override?: string }>;
    children?: Record<string, typeof resourceDef>;
  },
  spec: ParsedSpec,
  config: IronicConfig,
): ResourceNode {
  const node: ResourceNode = {
    name: camelCase(name),
    className: pascalCase(name),
    methods: [],
    children: [],
  };

  // Build methods
  if (resourceDef.methods) {
    for (const [methodName, methodDef] of Object.entries(resourceDef.methods).sort(([a], [b]) => a.localeCompare(b))) {
      const [httpMethod, path] = parseMethodPath(methodDef.path);
      const operation = findOperation(spec, httpMethod, path);

      if (!operation) {
        throw new IronicUserError(
          'RESOURCE_PATH_NOT_FOUND',
          `Path "${methodDef.path}" not found in spec. Check your resources config.`,
        );
      }

      node.methods.push(
        planMethod(camelCase(methodName), httpMethod, path, operation, {
          pagination: methodDef.pagination,
          streamOption: methodDef.stream_option,
          responseUnwrap: methodDef.response_unwrap,
          deprecated: methodDef.deprecated,
          descriptionOverride: methodDef.description_override,
        }, spec.schemaRegistry),
      );
    }
  }

  // Build children
  if (resourceDef.children) {
    for (const [childName, childDef] of Object.entries(resourceDef.children).sort(([a], [b]) => a.localeCompare(b))) {
      node.children.push(buildConfigResource(childName, childDef, spec, config));
    }
  }

  return node;
}

// ── Auto-inference ──

function planFromInference(
  spec: ParsedSpec,
  config: IronicConfig,
): ResourceNode[] {
  const prefix = resolvePathPrefix(config, Object.keys(spec.paths));

  // Group operations by their resource path
  const groups = new Map<string, { httpMethod: string; path: string; operation: OperationObject; segments: string[] }[]>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const httpMethod of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[httpMethod] as OperationObject | undefined;
      if (!operation) continue;

      const segments = getResourceSegments(path, prefix);
      const groupKey = segments[0] ?? '_root';

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push({ httpMethod, path, operation, segments });
    }
  }

  // Build resource tree from groups
  const resources: ResourceNode[] = [];

  for (const [groupKey, ops] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (groupKey === '_root') continue; // skip ungroupable paths

    // Check if we need nested resources (multiple distinct 2nd segments)
    const secondSegments = new Set(
      ops
        .map((op) => op.segments[1])
        .filter((s): s is string => s !== undefined),
    );

    if (secondSegments.size > 1) {
      // Nested resources: e.g. chat.completions
      const resource: ResourceNode = {
        name: camelCase(groupKey),
        className: pascalCase(groupKey),
        methods: [],
        children: [],
      };

      // Group by second segment
      const subGroups = new Map<string, typeof ops>();
      for (const op of ops) {
        const subKey = op.segments[1] ?? groupKey;
        if (!subGroups.has(subKey)) subGroups.set(subKey, []);
        subGroups.get(subKey)!.push(op);
      }

      for (const [subKey, subOps] of [...subGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const child: ResourceNode = {
          name: camelCase(subKey),
          className: pascalCase(subKey),
          // resourceDepth=2: skip the group key + the sub-key in path tails
          methods: buildMethods(subOps, spec.schemaRegistry, config, prefix, 2),
          children: [],
        };
        resource.children.push(child);
      }

      resources.push(resource);
    } else {
      // Flat resource
      resources.push({
        name: camelCase(groupKey),
        className: pascalCase(groupKey),
        // resourceDepth=1: skip the group key in path tails
        methods: buildMethods(ops, spec.schemaRegistry, config, prefix, 1),
        children: [],
      });
    }
  }

  return resources;
}

/**
 * Detect operationIds that bake the path + verb into the name — typical of
 * FastAPI's auto-generated ids (e.g. `list_my_orgs_api_v1_orgs_get`). These
 * are server-side noise; we fall back to inferred names instead.
 */
function isAutoGeneratedOperationId(opId: string, httpMethod: string): boolean {
  const suffix = `_${httpMethod.toLowerCase()}`;
  if (!opId.toLowerCase().endsWith(suffix)) return false;
  // Heuristic: also needs the body to be long enough to plausibly encode a path.
  // FastAPI's pattern (`name_path_segments_verb`) implies ≥ 3 underscores.
  const underscoreCount = (opId.match(/_/g) ?? []).length;
  return underscoreCount >= 3;
}

/**
 * Resolve the path prefix to strip during resource inference.
 * Honors config.paths.strip_prefix; if unset, auto-detects the longest common prefix.
 * Set strip_prefix to "" in config to disable both behaviors.
 */
function resolvePathPrefix(config: IronicConfig, allPaths: string[]): string {
  if (config.paths?.strip_prefix !== undefined) {
    return config.paths.strip_prefix;
  }
  return findCommonPathPrefix(allPaths);
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

      // Auto-detect pagination for GET list endpoints
      const pagination = detectPagination(op.httpMethod, op.operation, config);

      return planMethod(methodName, op.httpMethod, op.path, op.operation, pagination ? { pagination } : undefined, schemaRegistry);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Detect if an operation matches a configured or heuristically-inferred pagination scheme.
 *
 * Priority: explicit config match → heuristic match.
 * Heuristics (Tier 4):
 *   - `limit`+`offset` query AND response has `count`/`total` → offset
 *   - `after`/`cursor`+`limit` query AND response has `has_more`/`next_cursor` → cursor
 *   - response has `next_cursor` AND an array field → cursor (no cursor param required)
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

  // ── Explicit config match (highest priority) ──
  if (config?.pagination) {
    if (config.pagination.cursor) {
      const cursorParam = config.pagination.cursor.request.cursor_param;
      if (queryNames.has(cursorParam)) return 'cursor';
    }
    if (config.pagination.offset) {
      const pageParam = config.pagination.offset.request.page_param;
      if (queryNames.has(pageParam)) return 'offset';
    }
  }

  // ── Heuristic match ──
  const responseProps = getResponseProperties(operation);

  // Offset heuristic: limit + offset params, response has count/total
  if (
    queryNames.has('limit') &&
    queryNames.has('offset') &&
    (responseProps.has('count') || responseProps.has('total'))
  ) {
    return 'offset';
  }

  // Cursor heuristic: after/cursor param + limit, response has has_more or next_cursor
  const hasCursorParam = queryNames.has('after') || queryNames.has('cursor');
  const hasCursorResponse = responseProps.has('has_more') || responseProps.has('next_cursor');
  if (hasCursorParam && queryNames.has('limit') && hasCursorResponse) {
    return 'cursor';
  }

  // 4.2: response has next_cursor + at least one array field → cursor even without cursor param
  if (responseProps.has('next_cursor') && hasArrayField(operation)) {
    return 'cursor';
  }

  return undefined;
}

/**
 * Return the set of top-level property names from the operation's success response schema.
 */
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

/**
 * Return true if the success response schema has at least one array-type property.
 */
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

function parseMethodPath(input: string): [string, string] {
  const match = input.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/);
  if (!match) {
    throw new IronicUserError(
      'INVALID_METHOD_PATH',
      `Invalid method path: "${input}". Expected "METHOD /path".`,
    );
  }
  return [match[1]!.toLowerCase(), match[2]!];
}

function findOperation(
  spec: ParsedSpec,
  httpMethod: string,
  path: string,
): OperationObject | undefined {
  // Try exact match first
  const pathItem = spec.paths[path] as Record<string, unknown> | undefined;
  if (pathItem) {
    return pathItem[httpMethod] as OperationObject | undefined;
  }

  // Try with version prefix
  for (const specPath of Object.keys(spec.paths)) {
    if (stripVersionPrefix(specPath) === path) {
      const item = spec.paths[specPath] as Record<string, unknown>;
      return item?.[httpMethod] as OperationObject | undefined;
    }
  }

  return undefined;
}
