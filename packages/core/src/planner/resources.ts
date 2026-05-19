// ─── Resource Planner ────────────────────────────────────────────────────────
// Map endpoints → resource tree. Two modes:
// 1. Config-driven: user provides `resources:` in ironic.yml
// 2. Auto-inference: derive from path segments

import type { OperationObject, PathItemObject } from 'openapi3-ts/oas31';
import type { IronicConfig } from '../parser/config.schema.js';
import type { ParsedSpec } from '../parser/openapi.js';
import type { ResourceNode } from '../ir/types.js';
import { camelCase, pascalCase } from '../utils/naming.js';
import {
  getResourceSegments,
  inferMethodName,
  stripVersionPrefix,
} from '../utils/paths.js';
import { planMethod } from './methods.js';
import { IronicUserError } from '../errors.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

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
  // Group operations by their resource path
  const groups = new Map<string, { httpMethod: string; path: string; operation: OperationObject; segments: string[] }[]>();

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const httpMethod of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[httpMethod] as OperationObject | undefined;
      if (!operation) continue;

      const segments = getResourceSegments(path);
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
          methods: buildMethods(subOps, spec.schemaRegistry),
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
        methods: buildMethods(ops, spec.schemaRegistry),
        children: [],
      });
    }
  }

  return resources;
}

function buildMethods(
  ops: { httpMethod: string; path: string; operation: OperationObject }[],
  schemaRegistry?: Map<object, string>,
): ReturnType<typeof planMethod>[] {
  return ops
    .map((op) => {
      const methodName = op.operation.operationId
        ? camelCase(op.operation.operationId.split('.').pop() ?? op.operation.operationId)
        : inferMethodName(op.httpMethod, op.path);

      return planMethod(methodName, op.httpMethod, op.path, op.operation, undefined, schemaRegistry);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
