// ─── Utility Types ───────────────────────────────────────────────────────────
// Shared type definitions used across the runtime.
// These are copied verbatim into every generated SDK.

import type { PaginationConfig } from './pagination.js';

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
  // so any plain-object shape works. `null` is accepted as a "no query" sigil.
  query?: Record<string, unknown> | object | null;
  body?: unknown;
  headers?: HeadersInit;
  /** Operation cookie parameters. */
  cookies?: Record<string, string | number | boolean | null | undefined>;
  /** Generated OpenAPI query serialization metadata. */
  querySerialization?: Record<string, 'comma' | 'space' | 'pipe' | 'deepObject' | 'formObject' | 'formObjectComma'>;
  responseFormat?: 'json' | 'text' | 'binary';
  timeout?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  /** Generated pagination metadata; not sent over the wire. */
  pagination?: PaginationConfig;
  idempotencyKey?: string;
}

/** Pluggable logger. The client emits debug/info on request lifecycle and
 *  warn/error on retry decisions. Defaults to no-op. */
export interface Logger {
  debug?: (msg: string, meta?: object) => void;
  info?: (msg: string, meta?: object) => void;
  warn?: (msg: string, meta?: object) => void;
  error?: (msg: string, meta?: object) => void;
}

/** Options for the client constructor. */
export interface ClientOptions {
  baseURL?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  /** Set by generated clients from the API's security scheme. */
  auth?: {
    type: 'bearer' | 'basic' | 'api_key' | 'none';
    name?: string;
    in?: 'header' | 'query' | 'cookie';
  };
  timeout?: number;
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
  defaultQuery?: QueryParams;
  /** Custom fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Extra RequestInit options merged into every fetch call (lower precedence than per-call options). */
  fetchOptions?: RequestInit;
  /** Receives request lifecycle events. Falsy methods are skipped. */
  logger?: Logger;
}

/** Something that can be uploaded — File, Blob, or ReadableStream. */
export type Uploadable = File | Blob | ReadableStream<Uint8Array>;

/** A page of results from a list endpoint. */
export interface PageInfo {
  hasMore: boolean;
}

/** Finalizer function for cleanup. */
export type Finalizer = () => void;
