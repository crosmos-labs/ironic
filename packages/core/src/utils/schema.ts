// ─── Schema Utilities ────────────────────────────────────────────────────────
// Convert OpenAPI schema objects into IR TypeRef nodes.

import type { SchemaObject } from 'openapi3-ts/oas31';
import type { TypeRef } from '../ir/types.js';
import { pascalCase, safeIdentifier } from './naming.js';

/**
 * Convert an OpenAPI SchemaObject into an IR TypeRef.
 * Handles primitives, arrays, objects, enums, oneOf, allOf, anyOf, $ref.
 *
 * If a schemaRegistry is provided, schemas that match known component schemas
 * (by object identity) will produce RefTypeRef nodes instead of inline types.
 */
export function schemaToTypeRef(
  schema: SchemaObject | undefined,
  nameHint?: string,
  schemaRegistry?: Map<object, string>,
): TypeRef {
  if (!schema) return { kind: 'primitive', type: 'unknown' };

  // Check if this schema is a known component schema (by object identity)
  if (schemaRegistry && typeof schema === 'object') {
    const knownName = schemaRegistry.get(schema);
    if (knownName) {
      return { kind: 'ref', name: knownName };
    }
  }

  // $ref (should be dereferenced by now, but just in case)
  if ('$ref' in schema && typeof schema.$ref === 'string') {
    const refName = schema.$ref.split('/').pop() ?? 'Unknown';
    return { kind: 'ref', name: pascalCase(refName) };
  }

  // enum (string enum → union of string literals)
  if (schema.enum) {
    if (schema.type === 'string' || schema.type === 'integer') {
      return {
        kind: 'enum',
        values: schema.enum.map((v) => String(v)),
        type: schema.type === 'integer' ? 'number' : 'string',
      };
    }
    return { kind: 'primitive', type: 'unknown' };
  }

  // oneOf / anyOf → union
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf ?? schema.anyOf)!;
    const members = variants.map((v, i) =>
      schemaToTypeRef(v as SchemaObject, nameHint ? `${nameHint}Variant${i}` : undefined, schemaRegistry),
    );
    return {
      kind: 'union',
      members,
      discriminator: schema.discriminator?.propertyName,
    };
  }

  // allOf → intersection
  if (schema.allOf) {
    const members = schema.allOf.map((v, i) =>
      schemaToTypeRef(v as SchemaObject, nameHint ? `${nameHint}Part${i}` : undefined, schemaRegistry),
    );
    return { kind: 'intersection', members };
  }

  // array
  if (schema.type === 'array') {
    const items = schemaToTypeRef(
      schema.items as SchemaObject | undefined,
      nameHint ? `${nameHint}Item` : undefined,
      schemaRegistry,
    );
    return { kind: 'array', items };
  }

  // object
  if (schema.type === 'object' || schema.properties) {
    const properties: Record<string, { type: TypeRef; required: boolean; description?: string }> = {};
    const required = new Set(schema.required ?? []);

    for (const [propName, propSchema] of Object.entries(schema.properties ?? {})) {
      properties[propName] = {
        type: schemaToTypeRef(
          propSchema as SchemaObject,
          nameHint ? `${nameHint}${pascalCase(propName)}` : undefined,
          schemaRegistry,
        ),
        required: required.has(propName),
        description: (propSchema as SchemaObject).description,
      };
    }

    // additionalProperties
    if (schema.additionalProperties) {
      const valueType =
        schema.additionalProperties === true
          ? { kind: 'primitive' as const, type: 'unknown' as const }
          : schemaToTypeRef(schema.additionalProperties as SchemaObject, undefined, schemaRegistry);

      return {
        kind: 'record',
        valueType,
        properties: Object.keys(properties).length > 0 ? properties : undefined,
      };
    }

    if (Object.keys(properties).length === 0 && !nameHint) {
      return { kind: 'record', valueType: { kind: 'primitive', type: 'unknown' } };
    }

    return {
      kind: 'object',
      properties,
      name: nameHint ? safeIdentifier(pascalCase(nameHint)) : undefined,
    };
  }

  // nullable wrapper (OAS 3.0 compat via unknown cast, and OAS 3.1 type arrays)
  const schemaAny = schema as Record<string, unknown>;
  if (schemaAny.nullable) {
    const { nullable: _, ...rest } = schemaAny;
    const inner = schemaToTypeRef(rest as SchemaObject, nameHint, schemaRegistry);
    return { kind: 'nullable', inner };
  }

  // OAS 3.1: type can be an array like ["string", "null"]
  if (Array.isArray(schema.type)) {
    const types = schema.type as string[];
    const hasNull = types.includes('null');
    const nonNullTypes = types.filter((t) => t !== 'null');

    if (nonNullTypes.length === 1) {
      const inner = schemaToTypeRef({ ...schema, type: nonNullTypes[0] } as SchemaObject, nameHint, schemaRegistry);
      return hasNull ? { kind: 'nullable', inner } : inner;
    }
    // Multiple non-null types — rare, treat as union
    const members = nonNullTypes.map((t) =>
      schemaToTypeRef({ ...schema, type: t } as SchemaObject, nameHint, schemaRegistry),
    );
    if (hasNull) members.push({ kind: 'primitive', type: 'null' });
    return { kind: 'union', members };
  }

  // primitives
  switch (schema.type) {
    case 'string': return { kind: 'primitive', type: 'string' };
    case 'integer': return { kind: 'primitive', type: 'integer' };
    case 'number': return { kind: 'primitive', type: 'number' };
    case 'boolean': return { kind: 'primitive', type: 'boolean' };
    case 'null': return { kind: 'primitive', type: 'null' };
    default: return { kind: 'primitive', type: 'unknown' };
  }
}
