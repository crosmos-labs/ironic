import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IR, ResourceNode, TypeDef } from '@ironic/core';
import { emitClientFile } from './emitters/client.js';
import { emitResourceFile } from './emitters/resource.js';
import { emitPythonTypeFile } from './emitters/types.js';
import {
  emitPyprojectToml,
  emitReadme,
  emitLicense,
  emitPyTyped,
  emitTopLevelInit,
  emitResourcesInit,
  emitTypesInit,
} from './emitters/package-setup.js';
import { snakeCase } from './snippets/formatters.js';

export type FileTree = Map<string, string>;

export interface EmitOptions {
  runtimeSrcDir?: string;
  moduleName?: string;
  packageName?: string;
}

export function emit(ir: IR, options: EmitOptions = {}): FileTree {
  const files: FileTree = new Map();

  const pyPackageName = options.packageName ?? ir.meta.packageName;

  const moduleName =
    options.moduleName ??
    deriveModuleName(pyPackageName);
  const pyIR = { ...ir, meta: { ...ir.meta, packageName: pyPackageName } };

  // 1. Package scaffolding
  files.set('pyproject.toml', emitPyprojectToml(pyIR, moduleName));
  files.set('README.md', emitReadme(pyIR, moduleName));
  const licenseText = emitLicense(pyIR);
  if (licenseText) files.set('LICENSE', licenseText);
  files.set(`${moduleName}/py.typed`, emitPyTyped());

  // 2. Copy runtime files into {module}/_core/
  copyRuntimeFiles(files, moduleName, options.runtimeSrcDir, pyIR);

  // 3. Emit the main client
  files.set(`${moduleName}/_client.py`, emitClientFile(ir));

  // 4. Emit resource files (types are imported from ../types/)
  for (const resource of ir.resources) {
    emitResourceTree(files, resource, `${moduleName}/resources`);
  }
  files.set(`${moduleName}/resources/__init__.py`, emitResourcesInit(ir));

  // 5. Emit each type as its own file under types/ (Stainless convention)
  const typeFileNames: string[] = [];
  for (const type of ir.types) {
    const fileName = snakeCase(type.name);
    files.set(`${moduleName}/types/${fileName}.py`, emitPythonTypeFile(type, ir.types));
    typeFileNames.push(fileName);
  }

  // 6. Emit types/__init__.py barrel
  files.set(`${moduleName}/types/__init__.py`, emitTypesInit(ir.types));

  // 7. Emit __init__.py (barrel export)
  files.set(`${moduleName}/__init__.py`, emitTopLevelInit(ir));

  return files;
}

function deriveModuleName(packageName: string): string {
  let name = packageName
    .replace(/^@[^/]+\//, '')
    .replace(/[-_]?sdk$/i, '');
  if (!name) {
    const scopeMatch = packageName.match(/^@([^/]+)\//);
    name = scopeMatch?.[1] ?? 'sdk';
  }
  return name
    .replace(/-/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

function copyRuntimeFiles(
  files: FileTree,
  moduleName: string,
  runtimeSrcDir?: string,
  ir?: IR,
): void {
  const runtimeDir = runtimeSrcDir ?? resolveRuntimeDir();

  const runtimeFiles = [
    '_base_client.py',
    '_errors.py',
    '_pagination.py',
    '_streaming.py',
    '_types.py',
    '_uploads.py',
    '__init__.py',
  ];

  for (const file of runtimeFiles) {
    try {
      const content = readFileSync(resolve(runtimeDir, file), 'utf-8');
      files.set(`${moduleName}/_core/${file}`, content);
    } catch {
      files.set(
        `${moduleName}/_core/${file}`,
        `# TODO: Runtime file ${file} not found\n`,
      );
    }
  }

  if (ir) {
    files.set(
      `${moduleName}/_core/_version.py`,
      `PACKAGE_NAME = ${JSON.stringify(ir.meta.packageName)}\nVERSION = ${JSON.stringify(ir.meta.version)}\n`,
    );
  } else {
    try {
      files.set(
        `${moduleName}/_core/_version.py`,
        readFileSync(resolve(runtimeDir, '_version.py'), 'utf-8'),
      );
    } catch {
      files.set(
        `${moduleName}/_core/_version.py`,
        'PACKAGE_NAME = "unknown"\nVERSION = "0.0.0"\n',
      );
    }
  }
}

function resolveRuntimeDir(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return resolve(__dirname, '../../runtime-python/src');
  } catch {
    return resolve(process.cwd(), 'packages/runtime-python/src');
  }
}

function emitResourceTree(
  files: FileTree,
  resource: ResourceNode,
  basePath: string,
): void {
  const modName = snakeCase(resource.name);

  if (resource.children.length > 0) {
    const dirPath = `${basePath}/${modName}`;
    files.set(`${dirPath}/__init__.py`, emitResourceFile(resource));
    for (const child of resource.children) {
      emitResourceTree(files, child, dirPath);
    }
  } else {
    files.set(`${basePath}/${modName}.py`, emitResourceFile(resource));
  }
}
