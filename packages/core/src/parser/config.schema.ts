// ─── Config Schema ───────────────────────────────────────────────────────────
// Zod schema for ironic.yml — the source of truth for config validation.

import { z } from 'zod';

// ── Sub-schemas ──

const MethodSpecSchema = z.object({
  path: z.string().regex(/^(GET|POST|PUT|PATCH|DELETE)\s+\//, 'Must be "METHOD /path"'),
  pagination: z.string().optional(),
  stream_option: z.boolean().optional(),
  response_unwrap: z.union([z.string(), z.boolean()]).optional(),
  deprecated: z.boolean().optional(),
  description_override: z.string().optional(),
});

type ResourceSchemaInput = {
  methods?: Record<string, z.infer<typeof MethodSpecSchema>>;
  children?: Record<string, ResourceSchemaInput>;
};

const ResourceSchema: z.ZodType<ResourceSchemaInput> = z.lazy(() =>
  z.object({
    methods: z.record(MethodSpecSchema).optional(),
    children: z.record(ResourceSchema).optional(),
  }),
);

const PaginationCursorSchema = z.object({
  request: z.object({
    cursor_param: z.string().default('after'),
    limit_param: z.string().default('limit'),
  }),
  response: z.object({
    items_key: z.string().default('data'),
    has_more_key: z.string().default('has_more'),
    cursor_source: z
      .enum(['last_item_id', 'last_id_field', 'next_cursor_field'])
      .default('last_item_id'),
    cursor_field: z.string().default('id'),
  }),
});

const PaginationOffsetSchema = z.object({
  request: z.object({
    page_param: z.string().default('page'),
    per_page_param: z.string().default('per_page'),
  }),
  response: z.object({
    items_key: z.string().default('data'),
    total_key: z.string().default('total'),
  }),
});

const TypescriptTargetSchema = z.object({
  package_name: z.string(),
  output_dir: z.string().default('./generated/typescript'),
  publish: z
    .object({
      registry: z.enum(['npm', 'jsr', 'none']).default('npm'),
    })
    .optional(),
  options: z
    .object({
      runtime: z.enum(['node', 'browser', 'universal']).default('node'),
      tree_shaking: z.boolean().default(true),
    })
    .optional(),
  mcp_server: z
    .object({
      package_name: z.string(),
      output_dir: z.string().default('./generated/mcp'),
      transport: z.enum(['stdio', 'http']).default('stdio'),
    })
    .optional(),
});

const MethodOverrideSchema = z.object({
  path: z.string(),
  name: z.string(),
  deprecated: z.boolean().optional(),
  description_override: z.string().optional(),
});

// ── Main config schema ──

export const ConfigSchema = z.object({
  version: z.literal(1),

  organization: z
    .object({
      name: z.string().optional(),
      url: z.string().url().optional(),
      docs_url: z.string().url().optional(),
      contact_email: z.string().email().optional(),
    })
    .optional(),

  spec: z.string(),

  targets: z.object({
    typescript: TypescriptTargetSchema.optional(),
  }),

  client_settings: z
    .object({
      base_url: z.string().optional(),
      environments: z.record(z.string()).optional(),
      default_environment: z.string().optional(),
      timeout_ms: z.number().positive().default(60000),
      max_retries: z.number().int().min(0).default(2),
      user_agent_prefix: z.string().optional(),
    })
    .optional(),

  auth: z
    .object({
      type: z.enum(['bearer', 'api_key', 'basic', 'custom']).default('bearer'),
      env_var: z.string().optional(),
      header_name: z.string().optional(),
      username_env: z.string().optional(),
      password_env: z.string().optional(),
    })
    .optional(),

  pagination: z
    .object({
      cursor: PaginationCursorSchema.optional(),
      offset: PaginationOffsetSchema.optional(),
    })
    .optional(),

  resources: z.record(ResourceSchema).optional(),

  methods: z.array(MethodOverrideSchema).optional(),

  types: z
    .object({
      rename: z.record(z.string()).optional(),
    })
    .optional(),

  options: z
    .object({
      include_examples_in_docs: z.boolean().default(true),
      emit_readme: z.boolean().default(true),
      emit_changelog: z.boolean().default(false),
    })
    .optional(),
});

export type IronicConfig = z.infer<typeof ConfigSchema>;
