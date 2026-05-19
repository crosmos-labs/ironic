// ─── Streaming ───────────────────────────────────────────────────────────────
// SSE (Server-Sent Events) streaming support.
// Copied verbatim into every generated SDK.

/**
 * An async iterable that reads Server-Sent Events from a Response body.
 * Wraps a fetch Response and yields decoded events one-by-one.
 */
export class Stream<Event> implements AsyncIterable<Event> {
  private response: Response;
  private decoder: (line: string) => Event | null;

  constructor(
    response: Response,
    decoder: (line: string) => Event | null,
  ) {
    this.response = response;
    this.decoder = decoder;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Event> {
    const reader = this.response.body!.getReader();
    const textDecoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += textDecoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const event = this.decoder(line);
          if (event !== null) yield event;
        }
      }

      // Process any remaining data in the buffer
      if (buffer.length > 0) {
        const event = this.decoder(buffer);
        if (event !== null) yield event;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Collect all events into an array. Useful for non-streaming consumption.
   */
  async toArray(): Promise<Event[]> {
    const events: Event[] = [];
    for await (const event of this) {
      events.push(event);
    }
    return events;
  }

  /**
   * Abort the underlying response stream.
   */
  abort(): void {
    try {
      this.response.body?.cancel();
    } catch {
      // Ignore cancel errors
    }
  }
}

/**
 * Standard SSE decoder: strips `data: ` prefix, skips `[DONE]` sentinel,
 * parses remaining as JSON.
 */
export function sseDecoder<T>(line: string): T | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return null; // comment or empty
  if (!trimmed.startsWith('data: ')) return null;

  const data = trimmed.slice(6); // strip 'data: '
  if (data === '[DONE]') return null;

  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Create a Stream from a fetch Response, using the standard SSE decoder.
 */
export function createSSEStream<T>(response: Response): Stream<T> {
  return new Stream(response, sseDecoder<T>);
}
