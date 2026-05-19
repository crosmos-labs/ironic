import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parse, plan } from '../src/index.js';

const PETSTORE_CONFIG = resolve(
  import.meta.dirname,
  '../../../examples/petstore/ironic.yml',
);

describe('plan (petstore)', () => {
  it('produces expected resources', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    const resourceNames = ir.resources.map((r) => r.name).sort();
    expect(resourceNames).toEqual(['owners', 'pets']);
  });

  it('produces expected methods on pets', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    const pets = ir.resources.find((r) => r.name === 'pets')!;
    const methodNames = pets.methods.map((m) => m.name).sort();
    expect(methodNames).toEqual([
      'createPet',
      'deletePet',
      'getPet',
      'listPets',
      'updatePet',
    ]);
  });

  it('resolves request body types as refs', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    const pets = ir.resources.find((r) => r.name === 'pets')!;
    const createPet = pets.methods.find((m) => m.name === 'createPet')!;

    // Should be a ref to PetCreateParams, not an inline object
    expect(createPet.requestBody).toBeDefined();
    expect(createPet.requestBody!.kind).toBe('ref');
    if (createPet.requestBody!.kind === 'ref') {
      expect(createPet.requestBody!.name).toBe('PetCreateParams');
    }
  });

  it('resolves response types as refs', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    const pets = ir.resources.find((r) => r.name === 'pets')!;
    const getPet = pets.methods.find((m) => m.name === 'getPet')!;

    expect(getPet.responseType.kind).toBe('ref');
    if (getPet.responseType.kind === 'ref') {
      expect(getPet.responseType.name).toBe('Pet');
    }
  });

  it('extracts path params', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    const pets = ir.resources.find((r) => r.name === 'pets')!;
    const getPet = pets.methods.find((m) => m.name === 'getPet')!;

    expect(getPet.pathParams).toHaveLength(1);
    expect(getPet.pathParams[0]!.name).toBe('pet_id');
    expect(getPet.pathParams[0]!.tsName).toBe('petId');
  });

  it('extracts query params', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    const pets = ir.resources.find((r) => r.name === 'pets')!;
    const listPets = pets.methods.find((m) => m.name === 'listPets')!;

    const queryNames = listPets.queryParams.map((q) => q.name).sort();
    expect(queryNames).toEqual(['after', 'limit']);
  });

  it('collects types', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    const typeNames = ir.types.map((t) => t.name).sort();
    // Should include named component schemas
    expect(typeNames).toContain('Pet');
    expect(typeNames).toContain('Owner');
    expect(typeNames).toContain('PetCreateParams');
    expect(typeNames).toContain('PetUpdateParams');
  });

  it('preserves named refs in nested array properties', async () => {
    // Regression: component schemas used to be emitted via schemaToTypeRef
    // without the registry, so cross-references inside array `items` got
    // inlined as anonymous objects. With the fix, an inline `{ data: Owner[] }`
    // response keeps `Owner` as a ref, not a duplicated inline shape.
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    // Synthesized name now includes the resource class prefix:
    // `OwnersListOwnersResponse` (Stainless-style: ResourceClass + Method + Response).
    const listResponse = ir.types.find((t) => t.name === 'OwnersListOwnersResponse');
    expect(listResponse).toBeDefined();
    expect(listResponse!.type.kind).toBe('object');
    const obj = listResponse!.type as { kind: 'object'; properties: Record<string, { type: { kind: string; items?: { kind: string; name?: string } } }> };
    const dataItems = obj.properties.data?.type;
    expect(dataItems?.kind).toBe('array');
    expect(dataItems?.items?.kind).toBe('ref');
    expect(dataItems?.items?.name).toBe('Owner');
  });

  it('sets correct meta', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);

    expect(ir.meta.prettyName).toBe('Petstore');
    expect(ir.meta.packageName).toBe('@petstore/sdk');
    expect(ir.meta.baseURL).toBe('https://api.petstore.io/v1');
  });
});
