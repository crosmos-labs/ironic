// ─── Pagination ──────────────────────────────────────────────────────────────
// Auto-pagination support with async iteration.
// Copied verbatim into every generated SDK.

import type { RequestOptions } from './types.js';

export interface PaginationConfig {
  type: 'cursor' | 'offset';
  mode?: 'offset' | 'page_number';
  request: { cursorParam?: string; limitParam?: string; pageParam?: string; perPageParam?: string };
  response: {
    itemsKey: string;
    hasMoreKey?: string;
    cursorSource?: 'last_item_id' | 'last_id_field' | 'next_cursor_field';
    cursorField?: string;
    nextCursorKey?: string;
    totalKey?: string;
  };
}

/**
 * Base client interface that pages need to request the next page.
 * This avoids circular deps — the real client implements this.
 */
export interface PageClient {
  requestPage<Item>(
    PageClass: new (...args: ConstructorParameters<typeof AbstractPage<Item>>) => AbstractPage<Item>,
    options: RequestOptions,
  ): Promise<AbstractPage<Item>>;
}

/**
 * Abstract base for all page types. Implements async iteration
 * that automatically fetches subsequent pages.
 */
export abstract class AbstractPage<Item> implements AsyncIterable<Item> {
  protected _client: PageClient;
  protected options: RequestOptions;
  protected response: unknown;

  constructor(
    client: PageClient,
    response: unknown,
    options: RequestOptions,
  ) {
    this._client = client;
    this.response = response;
    this.options = options;
  }

  /** Return the items from this page. */
  abstract getPaginatedItems(): Item[];

  /** Return request options for the next page, or null if no more pages. */
  abstract nextPageRequestOptions(): RequestOptions | null;

  /** Whether there is a next page. */
  hasNextPage(): boolean {
    return this.nextPageRequestOptions() !== null;
  }

  /** Iterate over all items across all pages. */
  async *[Symbol.asyncIterator](): AsyncGenerator<Item> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let page: AbstractPage<Item> = this;
    while (true) {
      for (const item of page.getPaginatedItems()) {
        yield item;
      }
      const nextOpts = page.nextPageRequestOptions();
      if (!nextOpts) break;
      page = await this._client.requestPage(
        this.constructor as new (...args: ConstructorParameters<typeof AbstractPage<Item>>) => AbstractPage<Item>,
        nextOpts,
      );
    }
  }

  /** Iterate over pages (each page is yielded as a whole). */
  async *iterPages(): AsyncGenerator<AbstractPage<Item>> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let page: AbstractPage<Item> = this;
    while (true) {
      yield page;
      const nextOpts = page.nextPageRequestOptions();
      if (!nextOpts) break;
      page = await this._client.requestPage(
        this.constructor as new (...args: ConstructorParameters<typeof AbstractPage<Item>>) => AbstractPage<Item>,
        nextOpts,
      );
    }
  }

  /** Collect all items from all pages into a single array. */
  async toArray(): Promise<Item[]> {
    const items: Item[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }
}

/**
 * Cursor-based pagination.
 * Expects response shape: `{ data: Item[], has_more: boolean }`
 * Sends `after` query param with the last item's ID.
 */
export class CursorPage<Item> extends AbstractPage<Item> {
  data: Item[];
  has_more: boolean;

  constructor(
    client: PageClient,
    response: unknown,
    options: RequestOptions,
  ) {
    super(client, response, options);
    const body = response as Record<string, unknown>;
    const config = options.pagination?.response;
    this.data = (body[config?.itemsKey ?? 'data'] as Item[]) ?? [];
    this.has_more = config?.cursorSource === 'next_cursor_field'
      ? Boolean(body[config.nextCursorKey ?? 'next_cursor'])
      : Boolean(body[config?.hasMoreKey ?? 'has_more']);
  }

  getPaginatedItems(): Item[] {
    return this.data;
  }

  nextPageRequestOptions(): RequestOptions | null {
    if (!this.has_more) return null;
    const config = this.options.pagination;
    const cursor = config?.response.cursorSource === 'next_cursor_field'
      ? (this.response as Record<string, unknown>)[config.response.nextCursorKey ?? 'next_cursor']
      : (this.data[this.data.length - 1] as Record<string, unknown> | undefined)?.[config?.response.cursorField ?? 'id'];
    if (cursor == null) return null;

    return {
      ...this.options,
      query: {
        ...this.options.query,
        [config?.request.cursorParam ?? 'after']: cursor,
      },
    };
  }
}

/**
 * Offset-based pagination.
 * Expects response shape: `{ data: Item[], total: number }`
 * Sends `page` and `per_page` query params.
 */
export class OffsetPage<Item> extends AbstractPage<Item> {
  data: Item[];
  total: number;

  constructor(
    client: PageClient,
    response: unknown,
    options: RequestOptions,
  ) {
    super(client, response, options);
    const body = response as Record<string, unknown>;
    const config = options.pagination?.response;
    this.data = (body[config?.itemsKey ?? 'data'] as Item[]) ?? [];
    this.total = Number(body[config?.totalKey ?? 'total'] ?? 0);
  }

  getPaginatedItems(): Item[] {
    return this.data;
  }

  nextPageRequestOptions(): RequestOptions | null {
    const q = (this.options.query ?? {}) as Record<string, unknown>;
    const config = this.options.pagination;
    const pageParam = config?.request.pageParam ?? 'page';
    const perPageParam = config?.request.perPageParam ?? 'per_page';
    const mode = config?.mode ?? 'page_number';
    const current = Number(q[pageParam] ?? (mode === 'offset' ? 0 : 1));
    const perPage = Number(q[perPageParam] ?? this.data.length);
    if (!this.data.length || !perPage) return null;
    const next = mode === 'offset' ? current + this.data.length : current + 1;
    if ((mode === 'offset' ? next : current * perPage) >= this.total) return null;

    return {
      ...this.options,
      query: {
        ...q,
        [pageParam]: next,
        [perPageParam]: perPage,
      },
    };
  }
}
