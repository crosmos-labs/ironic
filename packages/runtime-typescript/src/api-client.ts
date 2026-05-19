// ─── Base API Client ─────────────────────────────────────────────────────────
// The HTTP client with retries, backoff, auth, and request building.
// Copied verbatim into every generated SDK.

import { APIError, APIConnectionError, APITimeoutError } from './errors.js';
import { Stream, createSSEStream } from './streaming.js';
import { AbstractPage, type PageClient } from './pagination.js';
import { buildFormData, isUploadable } from './uploads.js';
import { APIPromise } from './api-promise.js';
import type { ClientOptions, RequestOptions, QueryParams, HeaderValue } from './types.js';

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT = 60_000; // 60s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof APITimeoutError) return true;
  if (err instanceof APIConnectionError) return true;
  if (err instanceof TypeError && 'cause' in err) return true; // fetch network error
  return false;
}

/**
 * Base client that all generated SDK clients extend.
 * Handles authentication, retries, timeouts, and request building.
 */
export class BaseClient implements PageClient {
  baseURL: string;
  apiKey: string;
  maxRetries: number;
  timeout: number;
  private _fetch: typeof globalThis.fetch;
  private defaultHeaders: Record<string, string>;
  private defaultQuery: QueryParams;

  constructor(options: ClientOptions) {
    this.baseURL = (options.baseURL ?? '').replace(/\/+$/, '');
    this.apiKey = options.apiKey ?? '';
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this._fetch = options.fetch ?? globalThis.fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.defaultQuery = options.defaultQuery ?? {};
  }

  // ── HTTP verb helpers ────────────────────────────────────────────────────

  get<T>(path: string, options?: RequestOptions): APIPromise<T> {
    return this._call<T>('GET', path, options);
  }

  post<T>(path: string, options?: RequestOptions): APIPromise<T> {
    return this._call<T>('POST', path, options);
  }

  put<T>(path: string, options?: RequestOptions): APIPromise<T> {
    return this._call<T>('PUT', path, options);
  }

  patch<T>(path: string, options?: RequestOptions): APIPromise<T> {
    return this._call<T>('PATCH', path, options);
  }

  delete<T>(path: string, options?: RequestOptions): APIPromise<T> {
    return this._call<T>('DELETE', path, options);
  }

  private _call<T>(method: string, path: string, options?: RequestOptions): APIPromise<T> {
    return new APIPromise<T>(
      (async () => {
        const response = await this._request({ ...options, method, path });
        // 204 / empty body → return undefined as T (e.g. for DELETE).
        if (response.status === 204 || response.headers.get('content-length') === '0') {
          return { data: undefined as T, response };
        }
        const text = await response.text();
        const data = (text ? JSON.parse(text) : undefined) as T;
        return { data, response };
      })(),
    );
  }

  // ── Pagination ───────────────────────────────────────────────────────────

  async getAPIList<Item, P extends AbstractPage<Item>>(
    path: string,
    PageClass: new (...args: ConstructorParameters<typeof AbstractPage<Item>>) => P,
    options?: RequestOptions,
  ): Promise<P> {
    const response = await this._request({ ...options, method: 'GET', path });
    const body = await response.json();
    return new PageClass(this, body, { ...options, method: 'GET', path });
  }

  async requestPage<Item, P extends AbstractPage<Item>>(
    PageClass: new (...args: ConstructorParameters<typeof AbstractPage<Item>>) => P,
    options: RequestOptions,
  ): Promise<P> {
    const response = await this._request(options);
    const body = await response.json();
    return new PageClass(this, body, options);
  }

  // ── Streaming ────────────────────────────────────────────────────────────

  async stream<T>(path: string, options?: RequestOptions): Promise<Stream<T>> {
    const response = await this._request({
      ...options,
      method: options?.method ?? 'POST',
      path,
      headers: {
        ...options?.headers,
        Accept: 'text/event-stream',
      },
    });
    return createSSEStream<T>(response);
  }

  // ── Core request method ──────────────────────────────────────────────────

  private async _request(options: RequestOptions): Promise<Response> {
    const url = this._buildURL(options.path ?? '', options.query);
    const headers = this._buildHeaders(options.headers);
    const body = this._buildBody(options.body, headers);

    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    };

    return this._fetchWithRetry(
      url,
      init,
      options.maxRetries ?? this.maxRetries,
      options.timeout ?? this.timeout,
    );
  }

  private async _fetchWithRetry(
    url: string,
    init: RequestInit,
    retriesRemaining: number,
    timeout: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Combine user signal with timeout signal
    if (init.signal) {
      init.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await this._fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Retry on 429 (rate limit) or 5xx (server error)
      if ((response.status === 429 || response.status >= 500) && retriesRemaining > 0) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : this._retryDelay(this.maxRetries - retriesRemaining);
        await sleep(delay);
        return this._fetchWithRetry(url, init, retriesRemaining - 1, timeout);
      }

      if (!response.ok) {
        throw await this._makeError(response);
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof APIError) throw err;

      if (controller.signal.aborted && !init.signal?.aborted) {
        throw new APITimeoutError();
      }

      if (retriesRemaining > 0 && isRetryableError(err)) {
        await sleep(this._retryDelay(this.maxRetries - retriesRemaining));
        return this._fetchWithRetry(url, init, retriesRemaining - 1, timeout);
      }

      if (err instanceof Error) {
        throw new APIConnectionError(err.message, err);
      }
      throw err;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private _retryDelay(attempt: number): number {
    // Exponential backoff: 0.5s, 1s, 2s, 4s... capped at 8s, with ±10% jitter
    const base = Math.min(0.5 * Math.pow(2, attempt) * 1000, 8000);
    const jitter = 1 + (Math.random() - 0.5) * 0.2;
    return base * jitter;
  }

  private _buildURL(path: string, query?: object): string {
    const merged = { ...this.defaultQuery, ...(query as Record<string, unknown>) };
    const url = new URL(path.startsWith('/') ? `${this.baseURL}${path}` : path);

    for (const [key, value] of Object.entries(merged)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v);
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private _buildHeaders(
    requestHeaders?: Record<string, HeaderValue> | Headers | [string, string][],
  ): Headers {
    const headers = new Headers();

    // Default headers
    for (const [key, value] of Object.entries(this.defaultHeaders)) {
      headers.set(key, value);
    }

    // Auth
    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }

    // Request-specific headers
    if (requestHeaders) {
      const entries =
        requestHeaders instanceof Headers
          ? requestHeaders.entries()
          : Array.isArray(requestHeaders)
            ? requestHeaders
            : Object.entries(requestHeaders);

      for (const [key, value] of entries) {
        if (value === null || value === undefined) {
          headers.delete(key);
        } else {
          headers.set(key, value);
        }
      }
    }

    // Default content-type if not set and not FormData
    if (!headers.has('Content-Type') && !headers.has('content-type')) {
      headers.set('Content-Type', 'application/json');
    }

    return headers;
  }

  private _buildBody(body: unknown, headers: Headers): BodyInit | null | undefined {
    if (body === null || body === undefined) return undefined;

    // Check if body contains uploadable content
    if (typeof body === 'object' && body !== null && this._hasUploadable(body)) {
      headers.delete('Content-Type'); // let browser set multipart boundary
      return buildFormData(body as Record<string, unknown>);
    }

    return JSON.stringify(body);
  }

  private _hasUploadable(obj: unknown): boolean {
    if (isUploadable(obj)) return true;
    if (typeof obj !== 'object' || obj === null) return false;
    return Object.values(obj).some((v) => this._hasUploadable(v));
  }

  private async _makeError(response: Response): Promise<APIError> {
    let error: unknown;
    let message: string | undefined;

    try {
      const body = await response.json();
      error = body;
      if (typeof body === 'object' && body !== null) {
        message = (body as Record<string, unknown>).message as string | undefined;
        if (!message) {
          const errObj = (body as Record<string, unknown>).error;
          if (typeof errObj === 'object' && errObj !== null) {
            message = (errObj as Record<string, unknown>).message as string | undefined;
          }
        }
      }
    } catch {
      error = undefined;
      message = undefined;
    }

    return APIError.generate(response.status, error, message, response.headers);
  }
}

/**
 * Base class for API resources (e.g. `client.files`, `client.chat.completions`).
 * Each resource holds a reference to the client for making requests.
 */
export class APIResource {
  protected _client: BaseClient;

  constructor(client: BaseClient) {
    this._client = client;
  }
}
