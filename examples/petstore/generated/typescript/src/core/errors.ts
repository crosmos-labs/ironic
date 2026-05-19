// ─── Error Hierarchy ─────────────────────────────────────────────────────────
// Typed error classes for every HTTP status code that matters.
// Copied verbatim into every generated SDK.

export class APIError extends Error {
  readonly status: number | undefined;
  readonly headers: Headers | undefined;
  readonly error: unknown;
  readonly requestId: string | null;

  constructor(
    status: number | undefined,
    error: unknown,
    message: string | undefined,
    headers: Headers | undefined,
  ) {
    super(
      `${APIError.makeMessage(status, error, message)}`,
    );
    this.status = status;
    this.error = error;
    this.headers = headers;
    this.requestId =
      headers?.get('x-request-id') ?? headers?.get('x-amzn-requestid') ?? null;
  }

  private static makeMessage(
    status: number | undefined,
    error: unknown,
    message: string | undefined,
  ): string {
    const msg =
      message ??
      (typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : undefined);

    if (status && msg) return `${status} ${msg}`;
    if (status) return `${status} status code (no body)`;
    if (msg) return msg;
    return '(no status code or body)';
  }

  static generate(
    status: number,
    error: unknown,
    message: string | undefined,
    headers: Headers,
  ): APIError {
    switch (status) {
      case 400:
        return new BadRequestError(status, error, message, headers);
      case 401:
        return new AuthenticationError(status, error, message, headers);
      case 403:
        return new PermissionDeniedError(status, error, message, headers);
      case 404:
        return new NotFoundError(status, error, message, headers);
      case 409:
        return new ConflictError(status, error, message, headers);
      case 422:
        return new UnprocessableEntityError(status, error, message, headers);
      case 429:
        return new RateLimitError(status, error, message, headers);
      default:
        if (status >= 500) {
          return new InternalServerError(status, error, message, headers);
        }
        return new APIError(status, error, message, headers);
    }
  }
}

export class BadRequestError extends APIError {
  override readonly status = 400 as const;
}

export class AuthenticationError extends APIError {
  override readonly status = 401 as const;
}

export class PermissionDeniedError extends APIError {
  override readonly status = 403 as const;
}

export class NotFoundError extends APIError {
  override readonly status = 404 as const;
}

export class ConflictError extends APIError {
  override readonly status = 409 as const;
}

export class UnprocessableEntityError extends APIError {
  override readonly status = 422 as const;
}

export class RateLimitError extends APIError {
  override readonly status = 429 as const;
}

export class InternalServerError extends APIError {
  override readonly status: number;
  constructor(
    status: number,
    error: unknown,
    message: string | undefined,
    headers: Headers,
  ) {
    super(status, error, message, headers);
    this.status = status;
  }
}

export class APIConnectionError extends APIError {
  constructor(message: string, cause?: Error) {
    super(undefined, undefined, message, undefined);
    if (cause) this.cause = cause;
  }
}

export class APITimeoutError extends APIConnectionError {
  constructor() {
    super('Request timed out.');
  }
}
