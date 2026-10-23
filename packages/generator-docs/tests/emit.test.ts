import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { ConfigSchema, parse, plan } from '@ironic/core';
import { emit } from '../src/index.js';

const root = resolve(import.meta.dirname, '../../..');
const petstoreConfig = resolve(root, 'examples/petstore/ironic.yml');
const petstoreSpec = resolve(root, 'examples/petstore/openapi.yaml');

describe('docs generator', () => {
  it('generates a navigable API reference with searchable endpoints', async () => {
    const { config, spec } = await parse(petstoreConfig);
    const files = emit(plan(config, spec));

    expect(files.has('index.html')).toBe(true);
    expect(files.get('index.html')).toContain('Petstore API');
    expect(files.get('resources/pets.html')).toContain('GET');
    expect(files.get('resources/pets.html')).toContain('/pets/{pet_id}');
    expect(files.get('types/pet.html')).toContain('Unique identifier');
    expect(files.get('assets/site.js')).toContain('listPets');

    for (const [path, html] of files) {
      if (!path.endsWith('.html')) continue;
      for (const [, href] of html.matchAll(/href="([^"#]+)(?:#[^"]*)?"/g)) {
        const destination = resolve('/', dirname(path), href!);
        expect(files.has(destination.slice(1)), `${path} links to ${href}`).toBe(true);
      }
    }
  });

  it('escapes specification text and keeps generated URLs safe', async () => {
    const { config, spec } = await parse(petstoreConfig);
    const ir = plan(config, spec);
    ir.resources[0]!.name = '<img src=x onerror=alert(1)>';
    ir.resources[0]!.methods[0]!.description = '<script>alert(1)</script>';
    ir.types[0]!.description = '<b>unsafe</b>';
    const files = emit(ir, { title: '<unsafe>' });
    const pages = [...files].filter(([path]) => path.endsWith('.html'));

    expect(pages.some(([, html]) => html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))).toBe(true);
    expect(pages.some(([, html]) => html.includes('&lt;b&gt;unsafe&lt;/b&gt;'))).toBe(true);
    expect(pages.every(([, html]) => !html.includes('<unsafe>') && !html.includes('<script>alert(1)</script>'))).toBe(
      true,
    );
    expect([...files.keys()].some((path) => path.includes('<'))).toBe(false);
  });

  it('supports docs-only configuration through the CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ironic-docs-'));
    try {
      const output = join(directory, 'site');
      const config = join(directory, 'ironic.yml');
      writeFileSync(
        config,
        `spec: ${petstoreSpec}\ntargets:\n  docs:\n    output_dir: ${output}\n`,
      );
      const parsed = ConfigSchema.parse({ targets: { docs: {} } });
      expect(parsed.targets.docs?.output_dir).toBe('./generated/docs');

      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'packages/cli/src/index.ts', 'generate', '--target', 'docs', '-c', config],
        { cwd: root },
      );
      expect(existsSync(join(output, 'index.html'))).toBe(true);
      expect(readFileSync(join(output, 'index.html'), 'utf8')).toContain('<h1>Petstore API</h1>');
      expect(existsSync(join(output, 'resources/pets.html'))).toBe(true);
      expect(existsSync(join(output, 'assets/site.js'))).toBe(true);

      writeFileSync(
        config,
        `spec: ${petstoreSpec}\ntargets:\n  docs:\n    output_dir: ${output}\n    title: Petstore Reference\n`,
      );
      execFileSync(
        process.execPath,
        ['--import', 'tsx', 'packages/cli/src/index.ts', 'generate', '--target', 'docs', '-c', config],
        { cwd: root },
      );
      expect(readFileSync(join(output, 'index.html'), 'utf8')).toContain('<h1>Petstore Reference</h1>');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
