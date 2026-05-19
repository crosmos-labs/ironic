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
    expect(paths).toContain('src/resources/index.ts');
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
    // Environments block resolves to the production URL.
    expect(client).toContain("'production': 'https://api.petstore.io/v1'");
  });

  it('resource inlines its owned types', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const pets = files.get('src/resources/pets.ts')!;
    // Method signatures should use refs, not inlined objects.
    expect(pets).toContain('body: PetCreateParams, options?: RequestOptions): APIPromise<Pet>');
    expect(pets).toContain('Promise<Pet>');
    // Petstore has a single-resource use of Pet types — they all inline here.
    expect(pets).toContain('export interface Pet ');
    expect(pets).toContain('export interface PetCreateParams ');
    expect(pets).toContain('export interface PetListPetsParams ');
    // The declare-namespace block surfaces them under `Pets.Pet`.
    expect(pets).toContain('export declare namespace Pets {');
  });

  it('resources barrel re-exports each resource', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const barrel = files.get('src/resources/index.ts')!;
    expect(barrel).toContain("export { Pets,");
    expect(barrel).toContain("export { Owners,");
    expect(barrel).toContain("type Pet");
  });

  it('delete sends Accept */* via buildHeaders', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const pets = files.get('src/resources/pets.ts')!;
    expect(pets).toContain("import { buildHeaders } from '../core/headers.js'");
    expect(pets).toContain("Accept: '*/*'");
  });

  it('index.ts barrel exports client + resources', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const index = files.get('src/index.ts')!;
    expect(index).toContain("export { PetstoreClient } from './client.js'");
    expect(index).toContain("export { Pets } from './resources/pets.js'");
    expect(index).toContain("export { Owners } from './resources/owners.js'");
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

  it('snapshot: resources/index.ts (barrel)', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);
    expect(files.get('src/resources/index.ts')).toMatchSnapshot();
  });
});
