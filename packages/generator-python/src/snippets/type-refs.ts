import type { TypeRef, MethodNode, ResourceNode } from '@ironic/core';

export function emitPythonTypeRef(ref: TypeRef): string {
  switch (ref.kind) {
    case 'primitive':
      return primitiveMap[ref.type] ?? 'object';

    case 'ref':
      return ref.name;

    case 'enum':
      if (ref.type === 'string') {
        return `Literal[${ref.values.map((v) => `"${v}"`).join(', ')}]`;
      }
      return `Literal[${ref.values.join(', ')}]`;

    case 'array':
      return `List[${emitPythonTypeRef(ref.items)}]`;

    case 'nullable':
      return `Optional[${emitPythonTypeRef(ref.inner)}]`;

    case 'union':
      return `Union[${ref.members.map(emitPythonTypeRef).join(', ')}]`;

    case 'intersection':
      // Python doesn't have intersection types — use the first member
      return ref.members.length > 0 ? emitPythonTypeRef(ref.members[0]) : 'object';

    case 'record':
      return `Dict[str, ${emitPythonTypeRef(ref.valueType)}]`;

    case 'object':
      return emitInlineDict(ref.properties);

    default:
      return 'object';
  }
}

const primitiveMap: Record<string, string> = {
  string: 'str',
  number: 'float',
  integer: 'int',
  boolean: 'bool',
  null: 'None',
  unknown: 'object',
  void: 'None',
};

function emitInlineDict(
  properties: Record<string, { type: TypeRef; required: boolean; description?: string }>,
): string {
  const entries = Object.entries(properties);
  if (entries.length === 0) return 'Dict[str, object]';
  // For inline objects, just use Dict[str, object] — named TypedDicts handle the rest
  return 'Dict[str, object]';
}

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
    if (method.queryParamsTypeName) {
      refs.add(method.queryParamsTypeName);
    }
  }
  return refs;
}

export function needsTypingImport(ref: TypeRef): { list: boolean; dict: boolean; optional: boolean; union: boolean; literal: boolean } {
  const needs = { list: false, dict: false, optional: false, union: false, literal: false };
  walkForImports(ref, needs);
  return needs;
}

function walkForImports(ref: TypeRef, needs: { list: boolean; dict: boolean; optional: boolean; union: boolean; literal: boolean }): void {
  switch (ref.kind) {
    case 'array':
      needs.list = true;
      walkForImports(ref.items, needs);
      break;
    case 'nullable':
      needs.optional = true;
      walkForImports(ref.inner, needs);
      break;
    case 'union':
      needs.union = true;
      for (const m of ref.members) walkForImports(m, needs);
      break;
    case 'intersection':
      for (const m of ref.members) walkForImports(m, needs);
      break;
    case 'record':
      needs.dict = true;
      walkForImports(ref.valueType, needs);
      break;
    case 'enum':
      needs.literal = true;
      break;
    case 'object':
      needs.dict = true;
      for (const prop of Object.values(ref.properties)) walkForImports(prop.type, needs);
      break;
  }
}
