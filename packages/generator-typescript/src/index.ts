// ─── TypeScript Generator ────────────────────────────────────────────────────
// Main entry point: takes an IR, produces a FileTree (Map<path, contents>).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IR, ResourceNode, TypeDef } from '@ironic/core';
import { emitClientFile } from './emitters/client.js';
import { emitResourceFile } from './emitters/resource.js';
import { emitTypesFile, emitTypeDef } from './emitters/types.js';
import { emitPackageJson, emitTsConfig, emitReadme, emitLicense } from './emitters/package-json.js';
import { fileHeader } from './snippets/formatters.js';

/** Map from relative file path → file contents */
export type FileTree = Map<string, string>;

export interface EmitOptions {
  /** Absolute path to the runtime-typescript package src/ directory */
  runtimeSrcDir?: string;
}

/**
 * Generate a complete TypeScript SDK from an IR.
 * Returns a FileTree — the caller writes it to disk.
 */
export function emit(ir: IR, options: EmitOptions = {}): FileTree {
  const files: FileTree = new Map();

  // 1. Package scaffolding
  files.set('package.json', emitPackageJson(ir));
  files.set('tsconfig.json', emitTsConfig());
  files.set('README.md', emitReadme(ir));
  const licenseText = emitLicense(ir);
  if (licenseText) files.set('LICENSE', licenseText);

  // 2. Copy runtime files into src/core/
  copyRuntimeFiles(files, options.runtimeSrcDir, ir);

  // 3. Emit the main client
  files.set('src/client.ts', emitClientFile(ir));

  // 4. Partition types by ownership (Stainless: owned types inline in resource file,
  //    shared go to types/shared.ts).
  const { ownedByResource, shared, typeOwners } = partitionTypes(ir);
  const sharedTypeNames = new Set(shared.map((t) => t.name));

  // 5. Emit resource files with their owned types inlined.
  for (const resource of ir.resources) {
    emitResourceTree(files, resource, 'src/resources', ownedByResource, typeOwners, sharedTypeNames);
  }

  // 6. Emit shared types file (only if there are any).
  if (shared.length > 0) {
    files.set('src/types/shared.ts', emitTypesFile(shared));
    files.set('src/types/index.ts', `export * from './shared.js';\n`);
  }

  // 7. Emit src/resources/index.ts barrel — re-exports each resource class
  //    along with the types it owns. Mirrors Stainless's convention.
  files.set('src/resources/index.ts', emitResourcesBarrel(ir.resources, ownedByResource));

  // 8. Emit top-level index.ts (barrel)
  files.set('src/index.ts', emitIndexFile(ir, shared.length > 0));

  return files;
}

/**
 * Emit `src/resources/index.ts`: re-export each resource class and its owned
 * types so callers can do `import { Spaces, type Space } from 'crosmos/resources'`.
 */
function emitResourcesBarrel(
  resources: ResourceNode[],
  ownedByResource: Map<string, TypeDef[]>,
): string {
  const lines: string[] = [fileHeader(), ''];

  for (const resource of resources) {
    const owned = ownedByResource.get(resource.name) ?? [];
    const typeNames = owned.map((t) => `type ${t.name}`).sort();
    const exports = [resource.className, ...typeNames].join(', ');
    const filePath = resource.children.length > 0
      ? `./${resource.name}/index.js`
      : `./${resource.name}.js`;
    lines.push(`export { ${exports} } from '${filePath}';`);
  }

  return lines.join('\n') + '\n';
}

/**
 * Partition the IR's TypeDef list into:
 *   - ownedByResource: Map<resourceName, TypeDef[]>  inline emit
 *   - shared:         TypeDef[]                      types/shared.ts
 *   - typeOwners:     Map<typeName, resourceName>    cross-resource import lookup
 *
 * Ownership comes from each TypeDef's `resourceName` (set by the planner from
 * the `models:` block + inline-type discovery). Types with no resourceName are
 * "shared" — referenced by multiple resources or generic system types.
 */
function partitionTypes(ir: IR): {
  ownedByResource: Map<string, TypeDef[]>;
  shared: TypeDef[];
  typeOwners: Map<string, string>;
} {
  const ownedByResource = new Map<string, TypeDef[]>();
  const shared: TypeDef[] = [];
  const typeOwners = new Map<string, string>();

  for (const type of ir.types) {
    if (type.resourceName) {
      // Strip any nested-resource suffix (`spaces.drafts` → `spaces`) — owned
      // types live in the top-level resource file.
      const owner = type.resourceName.split('.')[0]!;
      typeOwners.set(type.name, owner);
      const arr = ownedByResource.get(owner) ?? [];
      arr.push(type);
      ownedByResource.set(owner, arr);
    } else {
      shared.push(type);
    }
  }

  return { ownedByResource, shared, typeOwners };
}

/**
 * Copy runtime TypeScript files into the generated SDK's src/core/ directory.
 */
function copyRuntimeFiles(files: FileTree, runtimeSrcDir?: string, ir?: IR): void {
  const runtimeDir = runtimeSrcDir ?? resolveRuntimeDir();

  const runtimeFiles = [
    'api-client.ts',
    'api-promise.ts',
    'env.ts',
    'errors.ts',
    'headers.ts',
    'pagination.ts',
    'path.ts',
    'streaming.ts',
    'uploads.ts',
    'types.ts',
  ];

  for (const file of runtimeFiles) {
    try {
      const content = readFileSync(resolve(runtimeDir, file), 'utf-8');
      files.set(`src/core/${file}`, content);
    } catch {
      // If runtime file doesn't exist, emit a placeholder
      files.set(`src/core/${file}`, `// TODO: Runtime file ${file} not found\n`);
    }
  }

  // Overwrite version.ts with the *generated SDK's* identity so the User-Agent
  // reflects the SDK package, not the runtime template.
  if (ir) {
    files.set(
      'src/core/version.ts',
      `// Generated by Ironic — reflects this SDK's package identity.
export const PACKAGE_NAME = ${JSON.stringify(ir.meta.packageName)};
export const VERSION = ${JSON.stringify(ir.meta.version)};
`,
    );
  } else {
    // Fallback: include the raw runtime file.
    try {
      files.set('src/core/version.ts', readFileSync(resolve(runtimeDir, 'version.ts'), 'utf-8'));
    } catch {
      files.set('src/core/version.ts', `export const PACKAGE_NAME = 'unknown';\nexport const VERSION = '0.0.0';\n`);
    }
  }

  // Core index
  files.set(
    'src/core/index.ts',
    `export { BaseClient, APIResource } from './api-client.js';
export { APIPromise } from './api-promise.js';
export { path } from './path.js';
export { buildHeaders, hasHeader } from './headers.js';
export { readEnv } from './env.js';
export { PACKAGE_NAME, VERSION } from './version.js';
export * from './errors.js';
export * from './pagination.js';
export * from './streaming.js';
export * from './uploads.js';
export type * from './types.js';
`,
  );
}

/**
 * Resolve the runtime source directory.
 */
function resolveRuntimeDir(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Go from generator-typescript/src/ → runtime-typescript/src/
    return resolve(__dirname, '../../runtime-typescript/src');
  } catch {
    return resolve(process.cwd(), 'packages/runtime-typescript/src');
  }
}

/**
 * Recursively emit resource files for a resource tree.
 */
function emitResourceTree(
  files: FileTree,
  resource: ResourceNode,
  basePath: string,
  ownedByResource: Map<string, TypeDef[]>,
  typeOwners: Map<string, string>,
  sharedTypeNames: Set<string>,
): void {
  const ctx = {
    ownedTypes: ownedByResource.get(resource.name) ?? [],
    typeOwners,
    sharedTypeNames,
  };

  if (resource.children.length > 0) {
    const dirPath = `${basePath}/${resource.name}`;
    files.set(`${dirPath}/index.ts`, emitResourceFile(resource, ctx));

    for (const child of resource.children) {
      emitResourceTree(files, child, dirPath, ownedByResource, typeOwners, sharedTypeNames);
    }
  } else {
    files.set(`${basePath}/${resource.name}.ts`, emitResourceFile(resource, ctx));
  }
}

/**
 * Emit the main index.ts barrel export.
 */
function emitIndexFile(ir: IR, hasSharedTypes: boolean): string {
  const lines: string[] = [
    fileHeader(),
    ``,
    `export { ${ir.meta.prettyName}Client } from './client.js';`,
    `export type { ${ir.meta.prettyName}ClientOptions } from './client.js';`,
    ``,
    `// Core`,
    `export { APIError, BadRequestError, AuthenticationError, PermissionDeniedError, NotFoundError, ConflictError, UnprocessableEntityError, RateLimitError, InternalServerError, APIConnectionError, APITimeoutError } from './core/errors.js';`,
    `export { APIPromise } from './core/api-promise.js';`,
    `export type { RequestOptions, ClientOptions } from './core/types.js';`,
  ];

  // Export resource classes
  if (ir.resources.length > 0) {
    lines.push('');
    lines.push('// Resources');
    for (const resource of ir.resources) {
      if (resource.children.length > 0) {
        lines.push(`export { ${resource.className} } from './resources/${resource.name}/index.js';`);
      } else {
        lines.push(`export { ${resource.className} } from './resources/${resource.name}.js';`);
      }
    }
  }

  // Shared types (only when there are any not owned by a resource)
  if (hasSharedTypes) {
    lines.push('');
    lines.push('// Shared types');
    lines.push(`export * from './types/index.js';`);
  }

  return lines.join('\n') + '\n';
}
