// ─── TypeRef Utilities ───────────────────────────────────────────────────────
// Walk TypeRef trees to collect referenced type names.

import type { TypeRef, MethodNode, ResourceNode } from '@ironic/core';

/**
 * Collect all named type references from a TypeRef tree.
 * Returns a Set of PascalCase type names that need importing.
 */
export function collectTypeRefs(ref: TypeRef): Set<string> {
  const refs = new Set<string>();
  walkTypeRef(ref, refs);
  return refs;
}

function walkTypeRef(ref: TypeRef, refs: Set<string>): void {
  switch (ref.kind) {
    case 'ref':
      refs.add(ref.name);
      break;
    case 'array':
      walkTypeRef(ref.items, refs);
      break;
    case 'nullable':
      walkTypeRef(ref.inner, refs);
      break;
    case 'union':
    case 'intersection':
      for (const member of ref.members) walkTypeRef(member, refs);
      break;
    case 'object':
      for (const prop of Object.values(ref.properties)) walkTypeRef(prop.type, refs);
      break;
    case 'record':
      walkTypeRef(ref.valueType, refs);
      if (ref.properties) {
        for (const prop of Object.values(ref.properties)) walkTypeRef(prop.type, refs);
      }
      break;
  }
}

/**
 * Collect all type references from a resource and its methods.
 */
export function collectResourceTypeRefs(resource: ResourceNode): Set<string> {
  const refs = new Set<string>();

  for (const method of resource.methods) {
    if (method.requestBody) {
      for (const r of collectTypeRefs(method.requestBody)) refs.add(r);
    }
    for (const r of collectTypeRefs(method.responseType)) refs.add(r);
    for (const param of [...method.pathParams, ...method.queryParams]) {
      for (const r of collectTypeRefs(param.type)) refs.add(r);
    }
  }

  return refs;
}
