// ─── Utility Types ───────────────────────────────────────────────────────────
// Shared type definitions used across the runtime.
// These are copied verbatim into every generated SDK.

/** A value that can be used as a header. */
export type HeaderValue = string | null | undefined;

/** Headers initializer — accepts Record, Headers, or array of tuples. */
export type HeadersInit =
  | Record<string, HeaderValue>
  | Headers
  | [string, string][];

/** Query parameters — flat key/value pairs. */
export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

/** Options for a single API request. */
export interface RequestOptions {
  method?: string;
  path?: string;
  // Accept any object — generated `*Params` interfaces don't carry an
  // index signature, so a stricter Record<string, ...> would reject them.
  // The runtime serializer iterates Object.entries and stringifies values,
  // so any plain-object shape works.
  query?: Record<string, unknown> | object;
  body?: unknown;
  headers?: HeadersInit;
  timeout?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

/** Options for the client constructor. */
export interface ClientOptions {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
  defaultQuery?: QueryParams;
  fetch?: typeof globalThis.fetch;
}

/** Something that can be uploaded — File, Blob, or ReadableStream. */
export type Uploadable = File | Blob | ReadableStream<Uint8Array>;

/** A page of results from a list endpoint. */
export interface PageInfo {
  hasMore: boolean;
}

/** Finalizer function for cleanup. */
export type Finalizer = () => void;
