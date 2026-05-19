// ─── OpenAPI Parser ──────────────────────────────────────────────────────────
// Parse, validate, and dereference an OpenAPI 3.x spec.

import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, PathItemObject, SchemaObject } from 'openapi3-ts/oas31';
import { IronicUserError } from '../errors.js';
import { pascalCase } from '../utils/naming.js';

export interface ParsedSpec {
  /** Fully dereferenced OpenAPI document */
  raw: OpenAPIObject;
  /** Spec metadata */
  info: {
    title: string;
    version: string;
    description?: string;
  };
  /** All paths with their operations */
  paths: Record<string, PathItemObject>;
  /** Component schemas (dereferenced) */
  schemas: Record<string, SchemaObject>;
  /** Security schemes */
  securitySchemes: Record<string, unknown>;
  /** Server URLs */
  servers: { url: string; description?: string }[];
  /**
   * Maps dereferenced schema objects back to their component names.
   * Uses object identity — after dereference(), all $refs pointing to
   * the same component resolve to the same JS object.
   */
  schemaRegistry: Map<object, string>;
}

/**
 * Parse and validate an OpenAPI spec file.
 * Dereferences all $ref pointers so downstream code sees fully inlined schemas.
 */
export async function parseOpenAPI(specPath: string): Promise<ParsedSpec> {
  let api: OpenAPIObject;

  try {
    // Validate + dereference in one pass
    api = (await SwaggerParser.validate(specPath, {
      dereference: { circular: 'ignore' },
    })) as OpenAPIObject;
  } catch (err) {
    throw new IronicUserError(
      'SPEC_INVALID',
      `Invalid OpenAPI spec: ${err instanceof Error ? err.message : String(err)}`,
      specPath,
    );
  }

  // Also get the fully dereferenced version
  try {
    api = (await SwaggerParser.dereference(specPath, {
      dereference: { circular: 'ignore' },
    })) as OpenAPIObject;
  } catch (err) {
    throw new IronicUserError(
      'SPEC_DEREF_FAILED',
      `Failed to dereference spec: ${err instanceof Error ? err.message : String(err)}`,
      specPath,
    );
  }

  const paths = (api.paths ?? {}) as Record<string, PathItemObject>;
  const schemas = ((api.components?.schemas as Record<string, SchemaObject>) ?? {});
  const securitySchemes = ((api.components?.securitySchemes as Record<string, unknown>) ?? {});
  const servers = (api.servers ?? []).map((s) => ({
    url: s.url,
    description: s.description,
  }));

  // Build reverse registry: schema object → PascalCase name
  // After dereference(), all $ref locations point to the same JS object,
  // so we can use object identity to detect named schemas anywhere in the spec.
  const schemaRegistry = new Map<object, string>();
  for (const [name, schema] of Object.entries(schemas)) {
    if (typeof schema === 'object' && schema !== null) {
      schemaRegistry.set(schema, pascalCase(name));
    }
  }

  return {
    raw: api,
    info: {
      title: api.info?.title ?? 'Untitled API',
      version: api.info?.version ?? '0.0.0',
      description: api.info?.description,
    },
    paths,
    schemas,
    securitySchemes,
    servers,
    schemaRegistry,
  };
}

