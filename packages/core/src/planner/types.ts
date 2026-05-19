// ─── Type Collector ──────────────────────────────────────────────────────────
// Walk all resources and collect the TypeDefs to emit.

import type { SchemaObject } from 'openapi3-ts/oas31';
import type { MethodNode, ParamNode, ResourceNode, TypeDef, TypeRef } from '../ir/types.js';
import type { ParsedSpec } from '../parser/openapi.js';
import type { IronicConfig } from '../parser/config.schema.js';
import { pascalCase } from '../utils/naming.js';
import { schemaToTypeRef } from '../utils/schema.js';

/**
 * The synthesized name for a method's query-params interface:
 *   spaces.list → SpaceListParams
 *   memories.list → MemoryListParams
 * Singular-resource prefix when possible; otherwise just the resource name.
 */
export function queryParamsTypeName(resourceClassName: string, methodName: string): string {
  // Strip a trailing 's' from the resource (Spaces → Space, Memories → Memorie?)
  // Imperfect for irregular plurals, so we use a small rule: trim 's', also handle 'ies' → 'y'.
  let base = resourceClassName;
  if (base.endsWith('ies') && base.length > 3) base = base.slice(0, -3) + 'y';
  else if (base.endsWith('s') && base.length > 1) base = base.slice(0, -1);
  return `${base}${pascalCase(methodName)}Params`;
}

/**
 * Collect all types that need to be emitted.
 * Sources: component schemas + inline schemas discovered in methods.
 */
export function collectTypes(
  resources: ResourceNode[],
  spec: ParsedSpec,
  config: IronicConfig,
): TypeDef[] {
  const types = new Map<string, TypeDef>();
  const renames = config.types?.rename ?? {};

  // 1. Emit all component schemas.
  // We pass the registry so cross-references between components emit as
  // RefTypeRef (e.g. EntityDetailResponse.memories.items → EntityMemory)
  // instead of being inlined as anonymous objects. We do a registry lookup
  // against the *outer* schema separately so a schema doesn't resolve to
  // itself — `schemaToTypeRef(s, n, registry)` would short-circuit to `s.ref`.
  for (const [schemaName, schema] of Object.entries(spec.schemas).sort(([a], [b]) => a.localeCompare(b))) {
    const finalName = renames[schemaName] ?? pascalCase(schemaName);

    if (types.has(finalName)) continue;

    types.set(finalName, {
      name: finalName,
      type: emitComponentBody(schema, finalName, spec.schemaRegistry),
      description: schema.description,
      isRequestBody: false,
    });
  }

  // 2. Walk resources to discover inline types and associate with resources
  for (const resource of resources) {
    walkResource(resource, types, resource.name);
  }

  return Array.from(types.values());
}

function walkResource(
  resource: ResourceNode,
  types: Map<string, TypeDef>,
  resourceName: string,
): void {
  for (const method of resource.methods) {
    // Collect inline request body types
    if (method.requestBody && isInlineType(method.requestBody)) {
      const name = pascalCase(`${method.name}Params`);
      if (!types.has(name)) {
        types.set(name, {
          name,
          type: method.requestBody,
          isRequestBody: true,
          resourceName,
        });
      }
    }

    // Collect inline response types
    if (isInlineType(method.responseType)) {
      const name = pascalCase(`${method.name}Response`);
      if (!types.has(name)) {
        types.set(name, {
          name,
          type: method.responseType,
          isRequestBody: false,
          resourceName,
        });
      }
    }

    // Synthesize a *Params interface for methods with query params,
    // and stash the name on the method so the emitter can reference it.
    if (method.queryParams.length > 0) {
      const name = queryParamsTypeName(resource.className, method.name);
      if (!types.has(name)) {
        types.set(name, {
          name,
          type: paramsToObjectTypeRef(method.queryParams),
          isRequestBody: false,
          resourceName,
        });
      }
      method.queryParamsTypeName = name;
    }
  }

  for (const child of resource.children) {
    walkResource(child, types, `${resourceName}.${child.name}`);
  }
}

/**
 * Emit a component schema's *body* (not as a ref to itself).
 *
 * `schemaToTypeRef(schema, name, registry)` would short-circuit and return
 * `{ kind: 'ref', name: <self> }` because the registry contains the schema's
 * own identity. We bypass that one-shot by walking the schema's children with
 * the registry and reconstructing the outer node manually.
 */
function emitComponentBody(
  schema: SchemaObject,
  name: string,
  registry: Map<object, string>,
): TypeRef {
  // Temporarily remove the schema from the registry so its children resolve
  // by identity to OTHER components but the outer schema doesn't ref itself.
  const ownName = registry.get(schema);
  if (ownName !== undefined) registry.delete(schema);
  try {
    return schemaToTypeRef(schema, name, registry);
  } finally {
    if (ownName !== undefined) registry.set(schema, ownName);
  }
}

/**
 * Synthesize an ObjectTypeRef from query-param nodes so the emitter can render
 * it as a normal interface.
 */
function paramsToObjectTypeRef(params: ParamNode[]): TypeRef {
  const properties: Record<string, { type: TypeRef; required: boolean; description?: string }> = {};
  for (const param of params) {
    // Use the original spec name as the property key — that's what gets serialized
    // onto the wire. The TypeScript-friendly `tsName` is for variable names, not
    // structural keys.
    properties[param.name] = {
      type: param.type,
      required: param.required,
      description: param.description,
    };
  }
  return { kind: 'object', properties };
}

/**
 * Check if a TypeRef is an inline type that needs its own definition.
 * Primitives, refs, and enums don't need separate defs.
 */
function isInlineType(ref: TypeRef): boolean {
  return ref.kind === 'object' || ref.kind === 'union' || ref.kind === 'intersection';
}
