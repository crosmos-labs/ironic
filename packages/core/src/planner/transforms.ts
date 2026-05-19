// ─── Transforms Pipeline ─────────────────────────────────────────────────────
// Pure spec → spec mutations that run between parser and planner.
// Each transform is a function; they're composed in declaration order.

import type { Transform } from '../parser/config.schema.js';
import type { ParsedSpec } from '../parser/openapi.js';

/**
 * Apply a list of transforms to a parsed spec (in order).
 * Returns the mutated spec (same object — transforms modify in-place).
 */
export function applyTransforms(spec: ParsedSpec, transforms: Transform[]): ParsedSpec {
  for (const t of transforms) {
    switch (t.type) {
      case 'rename_schema':
        renameSchema(spec, t.from, t.to);
        break;
      case 'drop_endpoint':
        dropEndpoint(spec, t.method, t.path);
        break;
      case 'extract_inline_schema':
        extractInlineSchema(spec, t.location, t.to);
        break;
      case 'dedupe_schemas':
        dedupeSchemas(spec);
        break;
    }
  }
  return spec;
}

// ── rename_schema ─────────────────────────────────────────────────────────────

/**
 * Rename a component schema and update all $ref strings in the spec.
 *
 * This operates on the raw `spec.paths` JSON (pre-dereference), not the
 * schemaRegistry — the registry is built after transforms run.
 */
function renameSchema(spec: ParsedSpec, from: string, to: string): void {
  if (!spec.schemas[from]) return;

  // Move the schema under the new name
  spec.schemas[to] = spec.schemas[from]!;
  delete spec.schemas[from];

  // Update every $ref in the spec (paths + components)
  const oldRef = `#/components/schemas/${from}`;
  const newRef = `#/components/schemas/${to}`;
  rewriteRefs(spec.paths as unknown as JsonNode, oldRef, newRef);
  rewriteRefs(spec.schemas as unknown as JsonNode, oldRef, newRef);
}

type JsonNode = Record<string, unknown> | unknown[] | string | number | boolean | null;

function rewriteRefs(node: JsonNode, oldRef: string, newRef: string): void {
  if (Array.isArray(node)) {
    for (const item of node) rewriteRefs(item as JsonNode, oldRef, newRef);
  } else if (node !== null && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj['$ref'] === 'string' && obj['$ref'] === oldRef) {
      obj['$ref'] = newRef;
    }
    for (const val of Object.values(obj)) {
      rewriteRefs(val as JsonNode, oldRef, newRef);
    }
  }
}

// ── drop_endpoint ─────────────────────────────────────────────────────────────

/**
 * Remove an HTTP method from a path item.
 * If no methods remain on the path, remove the path entirely.
 */
function dropEndpoint(spec: ParsedSpec, method: string, path: string): void {
  const pathItem = spec.paths[path] as Record<string, unknown> | undefined;
  if (!pathItem) return;
  delete pathItem[method.toLowerCase()];
  if (HTTP_VERBS.every((v) => !pathItem[v])) {
    delete spec.paths[path];
  }
}

const HTTP_VERBS = ['get', 'post', 'put', 'patch', 'delete'];

// ── extract_inline_schema ─────────────────────────────────────────────────────

/**
 * Promote an inline schema to a named component.
 *
 * `location` format: `"METHOD /path.requestBody"` or `"METHOD /path.responses.200"`
 *
 * Examples:
 *   "POST /chat/completions.requestBody"  → extracts requestBody.content.application/json.schema
 *   "GET /pets.responses.200"             → extracts responses.200.content.application/json.schema
 */
function extractInlineSchema(spec: ParsedSpec, location: string, to: string): void {
  const dotIdx = location.indexOf('.');
  if (dotIdx === -1) return;

  const methodPath = location.slice(0, dotIdx);
  const qualifier = location.slice(dotIdx + 1);
  const spaceIdx = methodPath.indexOf(' ');
  if (spaceIdx === -1) return;

  const method = methodPath.slice(0, spaceIdx).toLowerCase();
  const path = methodPath.slice(spaceIdx + 1);

  const pathItem = spec.paths[path] as Record<string, unknown> | undefined;
  if (!pathItem) return;

  const operation = pathItem[method] as Record<string, unknown> | undefined;
  if (!operation) return;

  let schema: Record<string, unknown> | undefined;
  let parent: Record<string, unknown> | undefined;
  let parentKey: string | undefined;

  if (qualifier === 'requestBody') {
    const rb = operation.requestBody as Record<string, unknown> | undefined;
    const content = rb?.content as Record<string, Record<string, unknown>> | undefined;
    const json = content?.['application/json'];
    if (json?.schema) {
      schema = json.schema as Record<string, unknown>;
      parent = json;
      parentKey = 'schema';
    }
  } else if (qualifier.startsWith('responses.')) {
    const statusCode = qualifier.split('.')[1]!;
    const responses = operation.responses as Record<string, Record<string, unknown>> | undefined;
    const response = responses?.[statusCode];
    const content = response?.content as Record<string, Record<string, unknown>> | undefined;
    const json = content?.['application/json'];
    if (json?.schema) {
      schema = json.schema as Record<string, unknown>;
      parent = json;
      parentKey = 'schema';
    }
  }

  if (!schema || !parent || !parentKey) return;

  // Register as a named component and replace with a $ref
  spec.schemas[to] = schema as import('openapi3-ts/oas31').SchemaObject;
  parent[parentKey] = { $ref: `#/components/schemas/${to}` };
}

// ── dedupe_schemas ────────────────────────────────────────────────────────────

/**
 * Collapse structurally-equal component schemas to the first occurrence.
 * All $refs to duplicates are rewritten to point at the canonical name.
 */
function dedupeSchemas(spec: ParsedSpec): void {
  const canonical = new Map<string, string>(); // serialized → first name seen
  const redirects = new Map<string, string>(); // duplicate name → canonical name

  for (const [name, schema] of Object.entries(spec.schemas)) {
    const key = JSON.stringify(schema);
    if (canonical.has(key)) {
      redirects.set(name, canonical.get(key)!);
    } else {
      canonical.set(key, name);
    }
  }

  for (const [duplicate, target] of redirects) {
    delete spec.schemas[duplicate];
    const oldRef = `#/components/schemas/${duplicate}`;
    const newRef = `#/components/schemas/${target}`;
    rewriteRefs(spec.paths as unknown as JsonNode, oldRef, newRef);
    rewriteRefs(spec.schemas as unknown as JsonNode, oldRef, newRef);
  }
}
