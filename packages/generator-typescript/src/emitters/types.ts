// ─── Type Emitter ────────────────────────────────────────────────────────────
// Emit TypeScript interfaces, type aliases, and enums from IR TypeDefs.

import type { TypeDef, TypeRef } from '@ironic/core';
import { jsdoc, joinBlocks } from '../snippets/formatters.js';

/**
 * Emit a single TypeRef as a TypeScript type string.
 */
export function emitTypeRef(ref: TypeRef): string {
  switch (ref.kind) {
    case 'primitive':
      return ref.type;

    case 'ref':
      return ref.name;

    case 'enum':
      return ref.values.map((v) =>
        ref.type === 'string' ? `'${v}'` : v,
      ).join(' | ');

    case 'array':
      const inner = emitTypeRef(ref.items);
      // Wrap unions in parens for readability: (A | B)[]
      return inner.includes('|') ? `(${inner})[]` : `${inner}[]`;

    case 'nullable':
      return `${emitTypeRef(ref.inner)} | null`;

    case 'union':
      return ref.members.map(emitTypeRef).join(' | ');

    case 'intersection':
      return ref.members.map(emitTypeRef).join(' & ');

    case 'record':
      return `Record<string, ${emitTypeRef(ref.valueType)}>`;

    case 'object':
      return emitInlineObject(ref.properties);

    default:
      return 'unknown';
  }
}

/**
 * Emit an inline object type: `{ foo: string; bar?: number }`.
 */
function emitInlineObject(
  properties: Record<string, { type: TypeRef; required: boolean; description?: string }>,
): string {
  const entries = Object.entries(properties).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return 'Record<string, unknown>';

  const props = entries.map(([name, prop]) => {
    const opt = prop.required ? '' : '?';
    return `  ${name}${opt}: ${emitTypeRef(prop.type)};`;
  });

  return `{\n${props.join('\n')}\n}`;
}

/**
 * Emit a full TypeDef as a TypeScript type declaration.
 */
export function emitTypeDef(def: TypeDef): string {
  const doc = jsdoc(def.description);

  // Object types → interface
  if (def.type.kind === 'object') {
    const entries = Object.entries(def.type.properties).sort(([a], [b]) => a.localeCompare(b));
    const props = entries.map(([name, prop]) => {
      const propDoc = prop.description ? `  /** ${prop.description} */\n` : '';
      const opt = prop.required ? '' : '?';
      return `${propDoc}  ${name}${opt}: ${emitTypeRef(prop.type)};`;
    });

    return joinBlocks(
      doc,
      `export interface ${def.name} {\n${props.join('\n')}\n}`,
    );
  }

  // Everything else → type alias
  return joinBlocks(
    doc,
    `export type ${def.name} = ${emitTypeRef(def.type)};`,
  );
}

/**
 * Emit a file of type definitions, grouped by resource.
 */
export function emitTypesFile(types: TypeDef[]): string {
  if (types.length === 0) return '';

  const defs = types
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(emitTypeDef);

  return defs.join('\n\n') + '\n';
}
