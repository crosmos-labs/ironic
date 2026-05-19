// ─── Pagination Planner ──────────────────────────────────────────────────────
// Extract pagination schemes from config.

import type { IronicConfig } from '../parser/config.schema.js';
import type { PaginationScheme } from '../ir/types.js';

/**
 * Build pagination schemes from config.
 */
export function planPagination(config: IronicConfig): PaginationScheme[] {
  const schemes: PaginationScheme[] = [];

  if (config.pagination?.cursor) {
    const c = config.pagination.cursor;
    schemes.push({
      name: 'cursor',
      type: 'cursor',
      request: {
        cursorParam: c.request.cursor_param,
        limitParam: c.request.limit_param,
      },
      response: {
        itemsKey: c.response.items_key,
        hasMoreKey: c.response.has_more_key,
        cursorSource: c.response.cursor_source,
        cursorField: c.response.cursor_field,
      },
    });
  }

  if (config.pagination?.offset) {
    const o = config.pagination.offset;
    schemes.push({
      name: 'offset',
      type: 'offset',
      request: {
        pageParam: o.request.page_param,
        perPageParam: o.request.per_page_param,
      },
      response: {
        itemsKey: o.response.items_key,
        totalKey: o.response.total_key,
      },
    });
  }

  return schemes;
}
