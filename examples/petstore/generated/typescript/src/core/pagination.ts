// ─── Pagination ──────────────────────────────────────────────────────────────
// Auto-pagination support with async iteration.
// Copied verbatim into every generated SDK.

import type { RequestOptions } from './types.js';

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
export class CursorPage<Item extends { id: string }> extends AbstractPage<Item> {
  data: Item[];
  has_more: boolean;

  constructor(
    client: PageClient,
    response: unknown,
    options: RequestOptions,
  ) {
    super(client, response, options);
    const body = response as Record<string, unknown>;
    this.data = (body.data as Item[]) ?? [];
    this.has_more = (body.has_more as boolean) ?? false;
  }

  getPaginatedItems(): Item[] {
    return this.data;
  }

  nextPageRequestOptions(): RequestOptions | null {
    if (!this.has_more || this.data.length === 0) return null;

    const lastItem = this.data[this.data.length - 1];
    if (!lastItem) return null;

    return {
      ...this.options,
      query: {
        ...this.options.query,
        after: lastItem.id,
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
    this.data = (body.data as Item[]) ?? [];
    this.total = (body.total as number) ?? 0;
  }

  getPaginatedItems(): Item[] {
    return this.data;
  }

  nextPageRequestOptions(): RequestOptions | null {
    const currentPage = ((this.options.query?.page as number) ?? 1);
    const perPage = ((this.options.query?.per_page as number) ?? 20);

    if (currentPage * perPage >= this.total) return null;

    return {
      ...this.options,
      query: {
        ...this.options.query,
        page: currentPage + 1,
        per_page: perPage,
      },
    };
  }
}
