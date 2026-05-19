// ─── Type Collector ──────────────────────────────────────────────────────────
// Walk all resources and collect the TypeDefs to emit.

import type { SchemaObject } from 'openapi3-ts/oas31';
import type { ResourceNode, TypeDef, TypeRef } from '../ir/types.js';
import type { ParsedSpec } from '../parser/openapi.js';
import type { IronicConfig } from '../parser/config.schema.js';
import { pascalCase } from '../utils/naming.js';
import { schemaToTypeRef } from '../utils/schema.js';

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

  // 1. Emit all component schemas
  for (const [schemaName, schema] of Object.entries(spec.schemas).sort(([a], [b]) => a.localeCompare(b))) {
    const finalName = renames[schemaName] ?? pascalCase(schemaName);

    if (types.has(finalName)) continue;

    types.set(finalName, {
      name: finalName,
      type: schemaToTypeRef(schema, finalName),
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
  }

  for (const child of resource.children) {
    walkResource(child, types, `${resourceName}.${child.name}`);
  }
}

/**
 * Check if a TypeRef is an inline type that needs its own definition.
 * Primitives, refs, and enums don't need separate defs.
 */
function isInlineType(ref: TypeRef): boolean {
  return ref.kind === 'object' || ref.kind === 'union' || ref.kind === 'intersection';
}
