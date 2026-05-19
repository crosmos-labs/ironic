// ─── Type Collector ──────────────────────────────────────────────────────────
// Walk all resources and collect the TypeDefs to emit.

import type { SchemaObject } from 'openapi3-ts/oas31';
import type { MethodNode, ParamNode, ResourceNode, TypeDef, TypeRef } from '../ir/types.js';
import type { ParsedSpec } from '../parser/openapi.js';
import type { IronicConfig } from '../parser/config.schema.js';
import { pascalCase } from '../utils/naming.js';
import { schemaToTypeRef } from '../utils/schema.js';
import { buildSchemaRenames } from './type-naming.js';
import { collectModelOwnership } from './resources.js';

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

  // The rename map was applied to the registry in the top-level `plan()` call.
  // We re-derive it here only to compute the *emit name* per schema; it must
  // match what's already in the registry.
  // Prefer the cached rename map from `plan()` (built once, reused here so the
  // emit name matches the schemaRegistry name). Fall back to a fresh heuristic
  // pass when `plan()` wasn't the entry point (e.g. unit tests).
  const renames =
    (spec as ParsedSpec & { _renames?: Record<string, string> })._renames ??
    buildSchemaRenames(Object.keys(spec.schemas), {});

  // Owner map: final type name → owning resource name (camelCase). Drives
  // inline emission per Stainless convention; unowned types go to types/shared.ts.
  const ownership = collectModelOwnership(config);

  // 1. Emit all component schemas under their final names.
  for (const [schemaName, schema] of Object.entries(spec.schemas).sort(([a], [b]) => a.localeCompare(b))) {
    const finalName = renames[schemaName] ?? pascalCase(schemaName);

    if (types.has(finalName)) continue;

    types.set(finalName, {
      name: finalName,
      type: emitComponentBody(schema, finalName, spec.schemaRegistry),
      description: schema.description,
      isRequestBody: false,
      resourceName: ownership[finalName],
    });
  }

  // 2. Walk resources to discover inline types and associate with resources
  for (const resource of resources) {
    walkResource(resource, types, resource.name);
  }

  // 3. Single-resource ownership inference. Stainless attributes types declared
  //    in `models:` explicitly, but a renamed request body like `SpaceCreateParams`
  //    (from `CreateSpaceRequest`) isn't in any models block — it's a component
  //    schema referenced only by one resource. Walk method type-refs: any
  //    unattributed type referenced by exactly one resource is attributed to it.
  inferSingleResourceOwnership(resources, types);

  return Array.from(types.values());
}

/**
 * Attribute each unowned component type to a resource if and only if exactly
 * one resource's methods (transitively, through any referenced types) reach it.
 * Multi-resource refs stay shared.
 *
 * Stainless's `models:` block declares the surface types; this routine catches
 * the supporting types referenced only by them — e.g. `EntityMemory` referenced
 * by `EntityDetail.memories[]`, or `SpaceCreateParams` (renamed request body).
 */
function inferSingleResourceOwnership(resources: ResourceNode[], types: Map<string, TypeDef>): void {
  // typeName → set of resource names that (transitively) reference it
  const refsByType = new Map<string, Set<string>>();

  const note = (typeName: string, resourceName: string) => {
    const set = refsByType.get(typeName) ?? new Set<string>();
    set.add(resourceName);
    refsByType.set(typeName, set);
  };

  // Start from each resource's method type-refs and walk into named types,
  // honoring the existing types-map so we can chase ref → def → its refs.
  const visit = (ref: TypeRef, resourceName: string, seen: Set<string>) => {
    for (const name of collectTypeRefNames(ref)) {
      if (seen.has(name)) continue;
      seen.add(name);
      note(name, resourceName);
      const def = types.get(name);
      if (def) visit(def.type, resourceName, seen);
    }
  };

  const walk = (resource: ResourceNode) => {
    for (const method of resource.methods) {
      const seen = new Set<string>();
      if (method.requestBody) visit(method.requestBody, resource.name, seen);
      visit(method.responseType, resource.name, seen);
      for (const p of [...method.pathParams, ...method.queryParams]) visit(p.type, resource.name, seen);
    }
    for (const child of resource.children) walk(child);
  };
  for (const r of resources) walk(r);

  for (const [typeName, refs] of refsByType) {
    if (refs.size !== 1) continue;
    const def = types.get(typeName);
    if (!def || def.resourceName) continue;
    def.resourceName = [...refs][0]!;
  }
}

/**
 * Walk a TypeRef tree and yield every named ref. Mirrors the generator's
 * collector — duplicated here to avoid a dependency from core → generator.
 */
function collectTypeRefNames(ref: TypeRef): Set<string> {
  const out = new Set<string>();
  const walk = (r: TypeRef) => {
    switch (r.kind) {
      case 'ref':
        out.add(r.name);
        return;
      case 'array':
        return walk(r.items);
      case 'nullable':
        return walk(r.inner);
      case 'union':
      case 'intersection':
        for (const m of r.members) walk(m);
        return;
      case 'object':
        for (const prop of Object.values(r.properties)) walk(prop.type);
        return;
      case 'record':
        walk(r.valueType);
        if (r.properties) for (const prop of Object.values(r.properties)) walk(prop.type);
        return;
    }
  };
  walk(ref);
  return out;
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
