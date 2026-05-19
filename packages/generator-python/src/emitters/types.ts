import type { TypeDef, TypeRef } from '@ironic/core';
import { snakeCase } from '@ironic/core';
import { emitPythonTypeRef, collectTypeRefs } from '../snippets/type-refs.js';
import { fileHeader, joinBlocks } from '../snippets/formatters.js';

export function emitPythonTypeDef(def: TypeDef): string {
  if (def.type.kind === 'object') {
    return emitTypedDict(def);
  }
  const doc = def.description ? `"""${def.description}"""` : '';
  const alias = `${def.name} = ${emitPythonTypeRef(def.type)}`;
  return doc ? `${alias}\n${doc}` : alias;
}

function emitTypedDict(def: TypeDef): string {
  const entries = Object.entries(def.type.kind === 'object' ? def.type.properties : {})
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return `class ${def.name}(TypedDict):\n    pass`;
  }

  const allRequired = entries.every(([, prop]) => prop.required);
  const allOptional = entries.every(([, prop]) => !prop.required);

  if (allRequired || allOptional) {
    const total = allRequired ? 'total=True' : 'total=False';
    const lines = [`class ${def.name}(TypedDict, ${total}):`];
    if (def.description) {
      lines.push(`    """${def.description}"""`);
      lines.push('');
    }
    for (const [name, prop] of entries) {
      const pyName = snakeCase(name);
      if (prop.description) {
        lines.push(`    # ${prop.description}`);
      }
      lines.push(`    ${pyName}: ${emitPythonTypeRef(prop.type)}`);
    }
    return lines.join('\n');
  }

  // Mixed required/optional: use two classes
  const requiredEntries = entries.filter(([, p]) => p.required);
  const optionalEntries = entries.filter(([, p]) => !p.required);

  const baseName = `_${def.name}Required`;
  const lines: string[] = [];

  // Required base
  lines.push(`class ${baseName}(TypedDict):`);
  for (const [name, prop] of requiredEntries) {
    const pyName = snakeCase(name);
    if (prop.description) lines.push(`    # ${prop.description}`);
    lines.push(`    ${pyName}: ${emitPythonTypeRef(prop.type)}`);
  }

  lines.push('');
  lines.push('');

  // Full class with optional fields
  lines.push(`class ${def.name}(${baseName}, total=False):`);
  if (def.description) {
    lines.push(`    """${def.description}"""`);
    lines.push('');
  }
  for (const [name, prop] of optionalEntries) {
    const pyName = snakeCase(name);
    if (prop.description) lines.push(`    # ${prop.description}`);
    lines.push(`    ${pyName}: ${emitPythonTypeRef(prop.type)}`);
  }

  return lines.join('\n');
}

export function emitPythonTypesFile(types: TypeDef[]): string {
  if (types.length === 0) return '';

  const localNames = new Set(types.map((t) => t.name));

  // Collect imports needed
  const allRefs = new Set<string>();
  const typingImports = new Set<string>();
  typingImports.add('Dict');  // always useful

  for (const type of types) {
    for (const ref of collectTypeRefs(type.type)) {
      allRefs.add(ref);
    }
    gatherTypingImports(type.type, typingImports);
  }

  const externalRefs = [...allRefs]
    .filter((ref) => !localNames.has(ref))
    .sort();

  const lines: string[] = [
    fileHeader(),
    '',
    'from __future__ import annotations',
    '',
  ];

  if (typingImports.size > 0) {
    lines.push(`from typing import ${[...typingImports].sort().join(', ')}`);
  }

  const needsLiteral = types.some((t) => hasLiteral(t.type));
  const needsTypedDict = types.some((t) => t.type.kind === 'object');

  const extImports: string[] = [];
  if (needsLiteral) extImports.push('Literal');
  if (needsTypedDict) extImports.push('TypedDict');

  if (extImports.length > 0) {
    lines.push(`from typing_extensions import ${extImports.join(', ')}`);
  }

  if (externalRefs.length > 0) {
    lines.push('');
    lines.push(`from .shared import ${externalRefs.join(', ')}`);
  }

  lines.push('');

  const defs = types
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(emitPythonTypeDef);

  lines.push(defs.join('\n\n\n'));
  lines.push('');

  return lines.join('\n');
}

function gatherTypingImports(ref: TypeRef, imports: Set<string>): void {
  switch (ref.kind) {
    case 'array':
      imports.add('List');
      gatherTypingImports(ref.items, imports);
      break;
    case 'nullable':
      imports.add('Optional');
      gatherTypingImports(ref.inner, imports);
      break;
    case 'union':
      imports.add('Union');
      for (const m of ref.members) gatherTypingImports(m, imports);
      break;
    case 'intersection':
      for (const m of ref.members) gatherTypingImports(m, imports);
      break;
    case 'record':
      imports.add('Dict');
      gatherTypingImports(ref.valueType, imports);
      break;
    case 'object':
      imports.add('Dict');
      for (const prop of Object.values(ref.properties)) gatherTypingImports(prop.type, imports);
      break;
  }
}

function hasLiteral(ref: TypeRef): boolean {
  switch (ref.kind) {
    case 'enum': return true;
    case 'array': return hasLiteral(ref.items);
    case 'nullable': return hasLiteral(ref.inner);
    case 'union':
    case 'intersection':
      return ref.members.some(hasLiteral);
    case 'object':
      return Object.values(ref.properties).some((p) => hasLiteral(p.type));
    case 'record':
      return hasLiteral(ref.valueType);
    default: return false;
  }
}
