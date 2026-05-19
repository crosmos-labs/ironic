// ─── OpenAPI Parser ──────────────────────────────────────────────────────────
// Parse, validate, and dereference an OpenAPI 3.x spec.

import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject, PathItemObject, SchemaObject } from 'openapi3-ts/oas31';
import { IronicUserError } from '../errors.js';

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
  };
}
