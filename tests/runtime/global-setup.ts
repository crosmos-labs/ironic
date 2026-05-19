// Regenerates the petstore example SDK before the runtime test suite runs.
// Keeps these tests honest: they always exercise a freshly generated SDK.

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export default async function setup() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..');
  const cliEntry = path.join(repoRoot, 'packages', 'cli', 'src', 'index.ts');
  const petstoreDir = path.join(repoRoot, 'examples', 'petstore');

  execSync(`npx tsx ${cliEntry} generate`, {
    cwd: petstoreDir,
    stdio: 'inherit',
  });
}
