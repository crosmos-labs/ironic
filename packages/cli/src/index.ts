#!/usr/bin/env node
// ─── Ironic CLI ──────────────────────────────────────────────────────────────

import { Command } from 'commander';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import pc from 'picocolors';
import { parse, plan, defaultConfig, IronicUserError } from '@ironic/core';
import type { IR } from '@ironic/core';
import { emit as emitTypescript } from '@ironic/generator-typescript';
import { emit as emitMcp } from '@ironic/generator-mcp';

const program = new Command();

program
  .name('ironic')
  .description('Generate idiomatic TypeScript SDKs and MCP servers from OpenAPI specs')
  .version('0.1.0');

// ── ironic generate ──

program
  .command('generate')
  .description('Generate SDK and/or MCP server from your spec')
  .option('-c, --config <path>', 'Path to ironic.yml', './ironic.yml')
  .option('-t, --target <target>', 'Target to generate (typescript, mcp, or both)')
  .option('--dry-run', 'Preview files without writing')
  .action(async (options) => {
    const startTime = performance.now();

    try {
      console.log(pc.bold(pc.cyan('⚡ ironic generate')));
      console.log();

      // Parse
      console.log(pc.dim('  Parsing config and spec...'));
      const configPath = resolve(options.config);
      const { config, spec } = await parse(configPath);
      console.log(pc.green('  ✓ Parsed successfully'));

      // Plan
      console.log(pc.dim('  Planning resources...'));
      const ir = plan(config, spec);
      console.log(
        pc.green(`  ✓ ${ir.resources.length} resources, ${ir.types.length} types`),
      );

      // Emit TypeScript SDK
      const target = options.target ?? 'both';
      let totalFiles = 0;

      if (target === 'typescript' || target === 'both') {
        if (config.targets.typescript) {
          console.log(pc.dim('  Generating TypeScript SDK...'));
          const tsFiles = emitTypescript(ir);
          const outDir = resolve(
            config.targets.typescript.output_dir ?? './generated/typescript',
          );
          if (!options.dryRun) {
            writeFileTree(tsFiles, outDir);
          }
          totalFiles += tsFiles.size;
          console.log(
            pc.green(`  ✓ ${tsFiles.size} files → ${pc.underline(outDir)}`),
          );
        }
      }

      // Emit MCP Server
      if (target === 'mcp' || target === 'both') {
        if (config.targets.typescript?.mcp_server) {
          console.log(pc.dim('  Generating MCP server...'));
          const mcpFiles = emitMcp(ir);
          const outDir = resolve(
            config.targets.typescript.mcp_server.output_dir ?? './generated/mcp',
          );
          if (!options.dryRun) {
            writeFileTree(mcpFiles, outDir);
          }
          totalFiles += mcpFiles.size;
          console.log(
            pc.green(`  ✓ ${mcpFiles.size} files → ${pc.underline(outDir)}`),
          );
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      console.log();
      console.log(
        pc.bold(pc.green(`  Done! ${totalFiles} files generated in ${elapsed}ms`)),
      );
      if (options.dryRun) {
        console.log(pc.yellow('  (dry run — no files written)'));
      }
    } catch (err) {
      handleError(err);
    }
  });

// ── ironic init ──

program
  .command('init')
  .description('Create a new ironic.yml config file')
  .action(() => {
    const configPath = resolve('./ironic.yml');
    if (existsSync(configPath)) {
      console.log(pc.yellow('ironic.yml already exists. Skipping.'));
      return;
    }
    writeFileSync(configPath, defaultConfig(), 'utf-8');
    console.log(pc.green('✓ Created ironic.yml'));
  });

// ── ironic validate ──

program
  .command('validate')
  .description('Validate your spec and config without generating')
  .option('-c, --config <path>', 'Path to ironic.yml', './ironic.yml')
  .action(async (options) => {
    try {
      const configPath = resolve(options.config);
      const { config, spec } = await parse(configPath);
      const ir = plan(config, spec);
      console.log(pc.green('✓ Valid!'));
      console.log(pc.dim(`  ${ir.resources.length} resources, ${ir.types.length} types`));
    } catch (err) {
      handleError(err);
    }
  });

// ── ironic plan ──

program
  .command('plan')
  .description('Show what resources would be generated')
  .option('-c, --config <path>', 'Path to ironic.yml', './ironic.yml')
  .action(async (options) => {
    try {
      const configPath = resolve(options.config);
      const { config, spec } = await parse(configPath);
      const ir = plan(config, spec);

      console.log(pc.bold('Resource tree:'));
      console.log();
      for (const resource of ir.resources) {
        printResource(resource, 0);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ── Helpers ──

function writeFileTree(files: Map<string, string>, outDir: string): void {
  for (const [relativePath, content] of files) {
    const absPath = resolve(outDir, relativePath);
    const dir = resolve(absPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(absPath, content, 'utf-8');
  }
}

function printResource(resource: { name: string; className: string; methods: { name: string; httpMethod: string; path: string }[]; children: typeof resource[] }, depth: number): void {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${pc.bold(resource.className)}`);
  for (const method of resource.methods) {
    console.log(
      `${indent}  .${method.name}()  ${pc.dim(`${method.httpMethod.toUpperCase()} ${method.path}`)}`,
    );
  }
  for (const child of resource.children) {
    printResource(child, depth + 1);
  }
}

function handleError(err: unknown): void {
  if (err instanceof IronicUserError) {
    console.error(pc.red(`✗ ${err.message}`));
    if (err.path) console.error(pc.dim(`  at ${err.path}`));
    process.exit(1);
  }
  console.error(pc.red('✗ Internal error:'));
  console.error(err);
  process.exit(1);
}

program.parse();
