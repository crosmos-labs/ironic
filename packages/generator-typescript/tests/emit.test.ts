import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parse, plan } from '@ironic/core';
import { emit } from '../src/index.js';

const PETSTORE_CONFIG = resolve(
  import.meta.dirname,
  '../../../examples/petstore/ironic.yml',
);

describe('TypeScript generator (petstore)', () => {
  it('emits expected file set', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const paths = [...files.keys()].sort();
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/client.ts');
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/resources/pets.ts');
    expect(paths).toContain('src/resources/owners.ts');
    expect(paths).toContain('src/types/shared.ts');
    expect(paths).toContain('src/types/index.ts');
    expect(paths).toContain('src/core/api-client.ts');
    expect(paths).toContain('src/core/errors.ts');
  });

  it('client references correct class name', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const client = files.get('src/client.ts')!;
    expect(client).toContain('export class PetstoreClient');
    expect(client).toContain('export interface PetstoreClientOptions');
    expect(client).toContain("baseURL: options.baseURL ?? 'https://api.petstore.io/v1'");
  });

  it('resource uses named type refs', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const pets = files.get('src/resources/pets.ts')!;
    // Should import types
    expect(pets).toContain("import type { CreatePetRequest, Pet, PetListPetsParams, UpdatePetRequest } from '../types/index.js'");
    // Method signatures should use refs, not inlined objects
    expect(pets).toContain('body: CreatePetRequest, options?: RequestOptions): APIPromise<Pet>');
    expect(pets).toContain('Promise<Pet>');
  });

  it('shared types file contains expected interfaces', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const shared = files.get('src/types/shared.ts')!;
    expect(shared).toContain('export interface Pet {');
    expect(shared).toContain('export interface Owner {');
    expect(shared).toContain('export interface CreatePetRequest {');
    expect(shared).toContain('export interface UpdatePetRequest {');
  });

  it('per-resource type files import from shared', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const petsTypes = files.get('src/types/pets.ts');
    if (petsTypes) {
      expect(petsTypes).toContain("import type { Pet } from './shared.js'");
    }
  });

  it('index.ts barrel exports everything', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const index = files.get('src/index.ts')!;
    expect(index).toContain("export { PetstoreClient } from './client.js'");
    expect(index).toContain("export { Pets } from './resources/pets.js'");
    expect(index).toContain("export { Owners } from './resources/owners.js'");
    expect(index).toContain("export * from './types/index.js'");
  });

  it('snapshot: client.ts', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);
    expect(files.get('src/client.ts')).toMatchSnapshot();
  });

  it('snapshot: resources/pets.ts', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);
    expect(files.get('src/resources/pets.ts')).toMatchSnapshot();
  });

  it('snapshot: types/shared.ts', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);
    expect(files.get('src/types/shared.ts')).toMatchSnapshot();
  });
});
