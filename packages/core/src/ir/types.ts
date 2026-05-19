// ─── Intermediate Representation ─────────────────────────────────────────────
// The IR is the bridge between parsing and emitting. Language-agnostic.
// Parsers produce it; emitters consume it.

// ── Top-level IR ──

export interface IR {
  meta: IRMeta;
  auth: AuthModel;
  resources: ResourceNode[];
  types: TypeDef[];
  paginationSchemes: PaginationScheme[];
}

export interface IRMeta {
  /** npm package name, e.g. "@acme/sdk" */
  packageName: string;
  /** PascalCase name for the client class, e.g. "Acme" */
  prettyName: string;
  /** Semver version */
  version: string;
  /** Human description */
  description: string;
  /** Default base URL */
  baseURL: string;
  /** Named environments */
  environments: Record<string, string>;
  /** Default environment key */
  defaultEnvironment?: string;
  /** Default timeout in ms */
  timeoutMs: number;
  /** Default max retries */
  maxRetries: number;
  /** User-Agent prefix */
  userAgentPrefix?: string;
  /** SPDX license identifier (e.g. "Apache-2.0", "MIT"). Stamped into package.json + LICENSE. */
  license?: string;
  /** Optional organization/author info for README + LICENSE. */
  organization?: {
    name?: string;
    docs?: string;
    contact?: string;
  };
  /** Example requests rendered into the README's Usage section. */
  exampleRequests?: Array<{
    name: string;
    endpoint: string;
    params?: Record<string, unknown>;
    responseProperty?: string;
    assignTo?: string;
  }>;
  /** Client constructor options declared in `client_settings.opts`. */
  clientOpts?: ClientOpt[];
}

/**
 * A single client-constructor option (Stainless `client_settings.opts.<name>`).
 */
export interface ClientOpt {
  /** Camel-cased identifier used in TypeScript code (e.g. `apiKey`). */
  tsName: string;
  /** Original snake_case key from the config (e.g. `api_key`). */
  configName: string;
  /** Primitive type to emit. */
  type: 'string' | 'number' | 'integer' | 'boolean';
  /** Description used in JSDoc. */
  description?: string;
  /** Whether `null` is a valid value. */
  nullable?: boolean;
  /** Environment variable to read from. */
  readEnv?: string;
  /** Indicates this opt provides credentials for a security scheme. */
  auth?: { securityScheme: string; role?: 'value' | 'username' | 'password' | 'client_id' | 'client_secret' };
  /** A literal default value (for non-required opts). */
  default?: unknown;
  /** Bound to a `{var}` placeholder in the environment URL. */
  serverVariable?: string;
}

// ── Auth ──

export interface AuthModel {
  type: 'bearer' | 'api_key' | 'basic' | 'custom' | 'none';
  /** Env var name for the API key */
  envVar: string;
  /** Header name (for api_key type) */
  headerName?: string;
  /** Username env var (for basic type) */
  usernameEnv?: string;
  /** Password env var (for basic type) */
  passwordEnv?: string;
}

// ── Resources ──

export interface ResourceNode {
  /** camelCase name, e.g. "chat" */
  name: string;
  /** PascalCase name for the class, e.g. "Chat" */
  className: string;
  /** Methods on this resource */
  methods: MethodNode[];
  /** Nested sub-resources */
  children: ResourceNode[];
}

export interface MethodNode {
  /** camelCase name, e.g. "create" */
  name: string;
  /** HTTP method */
  httpMethod: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** API path, e.g. "/chat/completions" */
  path: string;
  /** Method description */
  description?: string;
  /** Whether this method is deprecated */
  deprecated: boolean;
  /** Path parameters */
  pathParams: ParamNode[];
  /** Query parameters */
  queryParams: ParamNode[];
  /** Name of the synthesized params interface (set by the type collector when queryParams.length > 0) */
  queryParamsTypeName?: string;
  /** Request body type (null if no body) */
  requestBody: TypeRef | null;
  /** Response type */
  responseType: TypeRef;
  /** Pagination scheme name (if paginated) */
  pagination?: string;
  /** Whether this method supports streaming */
  streaming: boolean;
  /** Whether the streaming is toggled by a body param (e.g. stream: true) */
  streamOption: boolean;
  /** Key to unwrap from response (e.g. "choices" → return response.choices) */
  responseUnwrap?: string;
  /** The original operationId from the spec */
  operationId?: string;
}

export interface ParamNode {
  /** Parameter name as it appears in the spec */
  name: string;
  /** camelCase name for TypeScript */
  tsName: string;
  /** Type of the parameter */
  type: TypeRef;
  /** Whether the parameter is required */
  required: boolean;
  /** Description */
  description?: string;
}

// ── Types ──

export interface TypeDef {
  /** PascalCase name for the TypeScript type */
  name: string;
  /** The type reference */
  type: TypeRef;
  /** Description from the spec */
  description?: string;
  /** Whether this is a request body type */
  isRequestBody: boolean;
  /** Which resource this type belongs to (for file grouping) */
  resourceName?: string;
}

/** A reference to a type — can be primitive, object, array, ref, union, etc. */
export type TypeRef =
  | PrimitiveTypeRef
  | ObjectTypeRef
  | ArrayTypeRef
  | RecordTypeRef
  | RefTypeRef
  | EnumTypeRef
  | UnionTypeRef
  | IntersectionTypeRef
  | NullableTypeRef;

export interface PrimitiveTypeRef {
  kind: 'primitive';
  type: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'unknown' | 'void';
}

export interface ObjectTypeRef {
  kind: 'object';
  name?: string;
  properties: Record<string, {
    type: TypeRef;
    required: boolean;
    description?: string;
  }>;
}

export interface ArrayTypeRef {
  kind: 'array';
  items: TypeRef;
}

export interface RecordTypeRef {
  kind: 'record';
  valueType: TypeRef;
  properties?: Record<string, {
    type: TypeRef;
    required: boolean;
    description?: string;
  }>;
}

export interface RefTypeRef {
  kind: 'ref';
  name: string;
}

export interface EnumTypeRef {
  kind: 'enum';
  values: string[];
  type: 'string' | 'number';
}

export interface UnionTypeRef {
  kind: 'union';
  members: TypeRef[];
  discriminator?: string;
}

export interface IntersectionTypeRef {
  kind: 'intersection';
  members: TypeRef[];
}

export interface NullableTypeRef {
  kind: 'nullable';
  inner: TypeRef;
}

// ── Pagination ──

export interface PaginationScheme {
  name: string;
  type: 'cursor' | 'offset';
  request: {
    cursorParam?: string;
    limitParam?: string;
    pageParam?: string;
    perPageParam?: string;
  };
  response: {
    itemsKey: string;
    hasMoreKey?: string;
    cursorSource?: 'last_item_id' | 'last_id_field' | 'next_cursor_field';
    cursorField?: string;
    totalKey?: string;
  };
}
