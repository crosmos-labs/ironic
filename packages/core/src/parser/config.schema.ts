// ─── Config Schema ───────────────────────────────────────────────────────────
// Zod schema modeled on Stainless's stainless.yml (app.stainless.com/config.schema.json).
// Goal: a stainless.yml file should parse here unchanged — zero-effort migration.
//
// Ironic-only extensions (not in Stainless):
//   - `spec: <path>`             top-level path to the OpenAPI spec file
//   - `targets.typescript.mcp_server`  MCP server emission config
//   - `transforms: [...]`        Ironic's spec-transform pipeline (Stainless uses `openapi.transforms`)
//
// Everything else mirrors Stainless. Unknown keys are accepted via `.passthrough()`
// so the user can keep their full stainless.yml in place even when we don't
// implement every field yet.

import { z } from 'zod';

// ── Helpers ─────────────────────────────────────────────────────────────────

const NonEmptyString = z.string().min(1);

/** Stainless method shorthand: `"get /foo"` OR a full object describing the method. */
const MethodSpecSchema = z.union([
  // shorthand: "verb /path"
  z.string().regex(/^(get|post|put|patch|delete)\s+\//i, 'Must be "verb /path"'),
  // object form
  z
    .object({
      type: z.enum(['http']).default('http'),
      endpoint: z.string().regex(/^(get|post|put|patch|delete)\s+\//i),
      paginated: z.boolean().optional(),
      streaming: z.union([z.boolean(), z.object({}).passthrough()]).optional(),
      deprecated: z.boolean().optional(),
      description: z.string().optional(),
    })
    .passthrough(),
]);

/** Stainless model shorthand: a $ref string OR an object with more detail. */
const ModelSpecSchema = z.union([
  z.string(), // typically `#/components/schemas/Name`
  z.object({ openapi_uri: z.string() }).passthrough(),
]);

// ── ResourceConfig (recursive) ──────────────────────────────────────────────

const ResourceConfigSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z
    .object({
      models: z.record(ModelSpecSchema).optional(),
      methods: z.record(MethodSpecSchema).optional(),
      description: z.string().optional(),
      subresources: z.record(ResourceConfigSchema).optional(),
      deprecated: z.boolean().optional(),
      skip: z.boolean().optional(),
    })
    .passthrough(),
);

// ── Targets ─────────────────────────────────────────────────────────────────

const PublishNpmSchema = z.union([
  z.boolean(),
  z
    .object({
      auth_method: z.enum(['access-token', 'oidc']).optional(),
      release_environment: z.string().optional(),
    })
    .passthrough(),
]);

const TypeScriptTargetSchema = z
  .object({
    edition: z.string().optional(),
    package_name: NonEmptyString,
    production_repo: z.union([z.string(), z.null()]).optional(),
    publish: z
      .object({
        npm: PublishNpmSchema.optional(),
        jsr: z.union([z.boolean(), z.object({}).passthrough()]).optional(),
      })
      .passthrough()
      .optional(),
    skip: z.boolean().optional(),
    readme_title: z.string().optional(),
    keep_files: z.array(z.string()).optional(),
    options: z.object({}).passthrough().optional(),

    // ── Ironic extensions ─────────────────────────────────────────────────
    /** Path to write the generated TypeScript SDK. Stainless writes to production_repo. */
    output_dir: z.string().default('./generated/typescript'),
    /** Ironic-only: emit a companion MCP server. */
    mcp_server: z
      .object({
        package_name: z.string(),
        output_dir: z.string().default('./generated/mcp'),
        transport: z.enum(['stdio', 'http']).default('stdio'),
      })
      .optional(),
  })
  .passthrough();

const PythonTargetSchema = z
  .object({
    edition: z.string().optional(),
    package_name: NonEmptyString,
    project_name: z.string().optional(),
    production_repo: z.union([z.string(), z.null()]).optional(),
    publish: z.object({}).passthrough().optional(),
    skip: z.boolean().optional(),
    // Ironic extensions
    output_dir: z.string().default('./generated/python'),
    module_name: z.string().optional(),
  })
  .passthrough();

const TargetsSchema = z
  .object({
    typescript: TypeScriptTargetSchema.optional(),
    python: PythonTargetSchema.optional(),
    // Other targets (java, kotlin, go, ruby, terraform, cli, php, csharp, openapi, sql)
    // accepted as passthrough for now — not yet generated.
  })
  .passthrough();

// ── client_settings.opts ────────────────────────────────────────────────────

const ClientOptSchema = z
  .object({
    type: z.enum(['boolean', 'number', 'string', 'integer']).optional(),
    description: z.string().optional(),
    example: z.unknown().optional(),
    default: z.unknown().optional(),
    nullable: z.boolean().optional(),
    read_env: z.string().optional(),
    auth: z
      .object({
        security_scheme: z.string(),
        role: z.enum(['value', 'username', 'password', 'client_id', 'client_secret']).optional(),
      })
      .optional(),
    server_variable: z.string().optional(),
    send_in_header: z.string().optional(),
    send_as_query_param: z.string().optional(),
    send_as_body_param: z.string().optional(),
    send_as_path_param: z.string().optional(),
    required_in_tests: z.boolean().optional(),
  })
  .passthrough();

const ClientSettingsSchema = z
  .object({
    opts: z.record(ClientOptSchema).optional(),
    default_client_example_name: z.string().optional(),
    default_client_name: z.string().optional(),
    default_env_prefix: z.string().optional(),
    default_timeout: z.union([z.number(), z.object({}).passthrough()]).optional(),
    default_retries: z
      .object({
        max_retries: z.number().int().min(0).optional(),
        initial_delay_seconds: z.number().optional(),
        max_delay_seconds: z.number().optional(),
      })
      .optional(),
    default_headers: z.record(z.unknown()).optional(),
    response_headers: z.record(z.string()).optional(),
    idempotency: z.object({ header: z.string() }).optional(),
    omit_stainless_headers: z.boolean().optional(),
  })
  .passthrough();

// ── security & security_schemes ─────────────────────────────────────────────

/** Top-level security: list of requirement objects `[{HTTPBearer: []}]` (OpenAPI shape). */
const SecuritySchema = z.array(z.record(z.array(z.string())));

/** OpenAPI-shaped security scheme definitions, with optional Stainless extensions. */
const SecuritySchemeSchema = z
  .object({
    type: z.enum(['http', 'apiKey', 'oauth2', 'openIdConnect', 'mutualTLS']),
    scheme: z.string().optional(),
    bearerFormat: z.string().optional(),
    in: z.enum(['header', 'query', 'cookie']).optional(),
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

// ── readme.example_requests ─────────────────────────────────────────────────

const ExampleRequestSchema = z
  .object({
    type: z.enum(['request']).default('request'),
    endpoint: z.string(),
    params: z.record(z.unknown()).optional(),
    response_property: z.string().optional(),
    assign_to: z.string().optional(),
  })
  .passthrough();

const ReadmeSchema = z
  .object({
    example_requests: z.record(ExampleRequestSchema).optional(),
    example_types: z.object({}).passthrough().optional(),
    include_stainless_attribution: z.boolean().optional(),
  })
  .passthrough();

// ── settings ────────────────────────────────────────────────────────────────

const SettingsSchema = z
  .object({
    license: z
      .union([z.enum(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0', 'ISC']), z.string()])
      .optional(),
    disable_mock_tests: z.boolean().optional(),
    disable_tests: z.boolean().optional(),
    file_header: z.string().optional(),
    per_endpoint_security: z.boolean().optional(),
    positional_params: z.boolean().optional(),
    unwrap_response_fields: z.array(z.string()).optional(),
    unwrap_multiproperty_response_fields: z.boolean().optional(),
    require_websocket_dependencies: z.boolean().optional(),
    mock_server: z.union([z.boolean(), z.object({}).passthrough()]).optional(),
  })
  .passthrough();

// ── pagination (Stainless shape: object or array) ───────────────────────────

const PaginationSchemeSchema = z
  .object({
    description: z.string().optional(),
    type: z.enum(['cursor', 'cursor_id', 'cursor_url', 'fake_page', 'offset', 'page_number']).optional(),
    request: z.record(z.unknown()).optional(),
    response: z.record(z.unknown()).optional(),
    param_location: z.enum(['query', 'body']).optional(),
    continue_on_empty_items: z.boolean().optional(),
  })
  .passthrough();

const PaginationSchema = z.union([PaginationSchemeSchema, z.array(PaginationSchemeSchema)]);

// ── Ironic-only transforms (kept for back-compat with our Tier 5 work) ─────

const TransformRenameSchemaSchema = z.object({
  type: z.literal('rename_schema'),
  from: z.string(),
  to: z.string(),
});

const TransformDropEndpointSchema = z.object({
  type: z.literal('drop_endpoint'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string(),
});

const TransformExtractInlineSchemaSchema = z.object({
  type: z.literal('extract_inline_schema'),
  location: z.string(),
  to: z.string(),
});

const TransformDedupeSchemaSchema = z.object({
  type: z.literal('dedupe_schemas'),
});

const TransformSchema = z.discriminatedUnion('type', [
  TransformRenameSchemaSchema,
  TransformDropEndpointSchema,
  TransformExtractInlineSchemaSchema,
  TransformDedupeSchemaSchema,
]);

export type Transform = z.infer<typeof TransformSchema>;

export const ConfigSchema = z
  .object({
    /** Stainless edition string (e.g. `"2026-02-23"`). YAML may parse the bare
     *  date as a Date object — we coerce back to ISO string here. */
    edition: z
      .union([z.string(), z.date()])
      .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
      .optional(),

    organization: z
      .object({
        name: z.string().optional(),
        docs: z.string().optional(),
        contact: z.string().optional(),
        // Back-compat aliases (legacy Ironic shape).
        url: z.string().url().optional(),
        docs_url: z.string().url().optional(),
        contact_email: z.string().email().optional(),
      })
      .passthrough()
      .optional(),

    /** Ironic extension: path to the OpenAPI spec, relative to the config file. */
    spec: z.string().optional(),

    targets: TargetsSchema,

    /** Map of named environment → base URL. */
    environments: z.record(z.string()).optional(),

    resources: z.record(ResourceConfigSchema).optional(),

    readme: ReadmeSchema.optional(),

    settings: SettingsSchema.optional(),

    client_settings: ClientSettingsSchema.optional(),

    security: SecuritySchema.optional(),

    security_schemes: z.record(SecuritySchemeSchema).optional(),

    pagination: PaginationSchema.optional(),

    /** Stainless's transforms block (different command set from Ironic's). Currently passthrough. */
    openapi: z.object({}).passthrough().optional(),

    /** Ironic-only spec transforms — see planner/transforms.ts. */
    transforms: z.array(TransformSchema).optional(),
  })
  .passthrough();

export type IronicConfig = z.infer<typeof ConfigSchema>;
