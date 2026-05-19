// ─── Ironic Error Classes ────────────────────────────────────────────────────
// User-facing errors (bad config, bad spec) vs internal errors (bugs).

/**
 * Error caused by user input — bad config, bad spec, missing files.
 * Always has a human-readable message.
 */
export class IronicUserError extends Error {
  readonly code: string;
  readonly path?: string;

  constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = 'IronicUserError';
    this.code = code;
    this.path = path;
  }
}

/**
 * Internal error — a bug in Ironic itself.
 */
export class IronicInternalError extends Error {
  constructor(message: string) {
    super(`[internal] ${message}`);
    this.name = 'IronicInternalError';
  }
}
