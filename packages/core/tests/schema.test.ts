import { describe, it, expect } from 'vitest';
import type { SchemaObject } from 'openapi3-ts/oas31';
import { schemaToTypeRef } from '../src/utils/schema.js';

describe('schemaToTypeRef', () => {
  it('handles undefined', () => {
    expect(schemaToTypeRef(undefined)).toEqual({ kind: 'primitive', type: 'unknown' });
  });

  it('handles string', () => {
    expect(schemaToTypeRef({ type: 'string' })).toEqual({ kind: 'primitive', type: 'string' });
  });

  it('handles integer', () => {
    expect(schemaToTypeRef({ type: 'integer' })).toEqual({ kind: 'primitive', type: 'integer' });
  });

  it('handles number', () => {
    expect(schemaToTypeRef({ type: 'number' })).toEqual({ kind: 'primitive', type: 'number' });
  });

  it('handles boolean', () => {
    expect(schemaToTypeRef({ type: 'boolean' })).toEqual({ kind: 'primitive', type: 'boolean' });
  });

  it('handles $ref', () => {
    const schema = { $ref: '#/components/schemas/Pet' } as unknown as SchemaObject;
    expect(schemaToTypeRef(schema)).toEqual({ kind: 'ref', name: 'Pet' });
  });

  it('handles string enum', () => {
    const schema: SchemaObject = { type: 'string', enum: ['dog', 'cat', 'bird'] };
    expect(schemaToTypeRef(schema)).toEqual({
      kind: 'enum',
      values: ['dog', 'cat', 'bird'],
      type: 'string',
    });
  });

  it('handles array of strings', () => {
    const schema: SchemaObject = { type: 'array', items: { type: 'string' } };
    expect(schemaToTypeRef(schema)).toEqual({
      kind: 'array',
      items: { kind: 'primitive', type: 'string' },
    });
  });

  it('handles object with properties', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    };
    const result = schemaToTypeRef(schema, 'MyObj');
    expect(result.kind).toBe('object');
    if (result.kind === 'object') {
      expect(result.properties['name']).toEqual({
        type: { kind: 'primitive', type: 'string' },
        required: true,
        description: undefined,
      });
      expect(result.properties['age']?.required).toBe(false);
    }
  });

  it('handles oneOf as union', () => {
    const schema: SchemaObject = {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
      ],
    };
    const result = schemaToTypeRef(schema);
    expect(result.kind).toBe('union');
    if (result.kind === 'union') {
      expect(result.members).toHaveLength(2);
    }
  });

  it('handles allOf as intersection', () => {
    const schema: SchemaObject = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
    };
    const result = schemaToTypeRef(schema);
    expect(result.kind).toBe('intersection');
  });

  it('uses schema registry when available', () => {
    const petSchema: SchemaObject = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const registry = new Map<object, string>([[petSchema, 'Pet']]);

    // When the exact same object is passed, it should return a ref
    expect(schemaToTypeRef(petSchema, undefined, registry)).toEqual({
      kind: 'ref',
      name: 'Pet',
    });

    // A different object with same shape should NOT be a ref
    const differentObj: SchemaObject = { type: 'object', properties: { name: { type: 'string' } } };
    const result = schemaToTypeRef(differentObj, undefined, registry);
    expect(result.kind).toBe('object');
  });
});
