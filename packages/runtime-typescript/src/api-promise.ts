// ─── APIPromise ──────────────────────────────────────────────────────────────
// A thenable returned by every SDK method. `await`ing it yields the parsed
// body, but `.asResponse()` / `.withResponse()` expose the raw fetch Response
// for users who need headers, status, request IDs, etc.

/**
 * Promise-compatible wrapper that carries the original Response.
 * Users can `await` it normally to get parsed data, OR call
 * `.asResponse()` / `.withResponse()` to inspect headers and metadata.
 */
export class APIPromise<T> implements PromiseLike<T> {
  constructor(
    private readonly responsePromise: Promise<{ data: T; response: Response }>,
  ) {}

  /**
   * Get just the raw fetch Response (body may be consumed already).
   */
  async asResponse(): Promise<Response> {
    return (await this.responsePromise).response;
  }

  /**
   * Get both the parsed data and the raw Response.
   */
  async withResponse(): Promise<{ data: T; response: Response }> {
    return this.responsePromise;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.responsePromise.then((r) => r.data).then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.then(undefined, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.then(
      (v) => { onfinally?.(); return v; },
      (e) => { onfinally?.(); throw e; },
    );
  }
}
