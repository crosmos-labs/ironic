import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parse, plan } from '@ironic/core';
import { emit } from '../src/index.js';

const PETSTORE_CONFIG = resolve(
  import.meta.dirname,
  '../../../examples/petstore/ironic.yml',
);

describe('MCP generator (petstore)', () => {
  it('emits expected file set', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const paths = [...files.keys()].sort();
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/sandbox.ts');
    expect(paths).toContain('src/docs.ts');
    expect(paths).toContain('src/tools/execute-code.ts');
    expect(paths).toContain('src/tools/search-docs.ts');
    expect(paths).toContain('docs/pets.md');
    expect(paths).toContain('docs/owners.md');
  });

  it('sandbox imports the correct client', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const sandbox = files.get('src/sandbox.ts')!;
    expect(sandbox).toContain("import { PetstoreClient } from '@petstore/sdk'");
    expect(sandbox).toContain("process.env['PETSTORE_API_KEY']");
  });

  it('server entry uses correct name', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const entry = files.get('src/index.ts')!;
    expect(entry).toContain("name: 'petstore-mcp'");
  });

  it('docs contain method signatures', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const petsDocs = files.get('docs/pets.md')!;
    expect(petsDocs).toContain('## client.pets.createPet(body)');
    expect(petsDocs).toContain('## client.pets.listPets(params?)');
    expect(petsDocs).toContain('**Returns**: `Promise<Pet>`');
  });

  it('docs contain parameter tables', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);

    const petsDocs = files.get('docs/pets.md')!;
    expect(petsDocs).toContain('| Name | Type | Required | Description |');
    expect(petsDocs).toContain('`petId`');
    expect(petsDocs).toContain('`CreatePetRequest`');
  });

  it('snapshot: docs/pets.md', async () => {
    const { config, spec } = await parse(PETSTORE_CONFIG);
    const ir = plan(config, spec);
    const files = emit(ir);
    expect(files.get('docs/pets.md')).toMatchSnapshot();
  });
});
