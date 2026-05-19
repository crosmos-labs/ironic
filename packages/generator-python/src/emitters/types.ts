import type { TypeDef, TypeRef } from '@ironic/core';
import { snakeCase } from '@ironic/core';
import { emitPythonTypeRef, collectTypeRefs } from '../snippets/type-refs.js';
import { fileHeader } from '../snippets/formatters.js';
import { snakeCase as toSnake } from '../snippets/formatters.js';

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

  // Mixed required/optional: use Required[] annotation (Stainless convention)
  const lines: string[] = [];
  lines.push(`class ${def.name}(TypedDict, total=False):`);
  if (def.description) {
    lines.push(`    """${def.description}"""`);
    lines.push('');
  }

  for (const [name, prop] of entries) {
    const pyName = snakeCase(name);
    if (prop.description) lines.push(`    # ${prop.description}`);
    if (prop.required) {
      lines.push(`    ${pyName}: Required[${emitPythonTypeRef(prop.type)}]`);
    } else {
      lines.push(`    ${pyName}: ${emitPythonTypeRef(prop.type)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Emit a single type as its own file (Stainless convention: one type per file).
 */
export function emitPythonTypeFile(def: TypeDef, allTypes: TypeDef[]): string {
  const localName = def.name;

  const typingImports = new Set<string>();
  gatherTypingImports(def.type, typingImports);

  const extImports: string[] = [];
  const needsLiteral = hasLiteral(def.type);
  const needsTypedDict = def.type.kind === 'object';
  const needsRequired = def.type.kind === 'object' && hasRequired(def);

  if (needsLiteral) extImports.push('Literal');
  if (needsRequired) extImports.push('Required');
  if (needsTypedDict) extImports.push('TypedDict');

  const externalRefs = [...collectTypeRefs(def.type)]
    .filter((ref) => ref !== localName)
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

  if (extImports.length > 0) {
    lines.push(`from typing_extensions import ${extImports.sort().join(', ')}`);
  }

  if (externalRefs.length > 0) {
    for (const ref of externalRefs) {
      const refFile = toSnake(ref);
      lines.push(`from .${refFile} import ${ref}`);
    }
  }

  lines.push('');
  lines.push(`__all__ = ["${def.name}"]`);
  lines.push('');
  lines.push('');
  lines.push(emitPythonTypeDef(def));
  lines.push('');

  return lines.join('\n');
}

function hasRequired(def: TypeDef): boolean {
  if (def.type.kind !== 'object') return false;
  const entries = Object.entries(def.type.properties);
  const hasReq = entries.some(([, p]) => p.required);
  const hasOpt = entries.some(([, p]) => !p.required);
  return hasReq && hasOpt;
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
