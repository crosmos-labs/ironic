// ─── Pagination Planner ──────────────────────────────────────────────────────
// Read the Stainless-shaped `pagination:` block (object or array of schemes).

import type { IronicConfig } from '../parser/config.schema.js';
import type { PaginationScheme } from '../ir/types.js';

/**
 * Build pagination schemes from config. Stainless allows `pagination:` to be
 * either a single scheme object or an array of schemes.
 *
 * Each scheme has:
 *   type:     cursor | offset | page_number | cursor_id | cursor_url | fake_page
 *   request:  free-form (e.g. {cursor_param: after, limit_param: limit})
 *   response: free-form (e.g. {items_key: data, has_more_key: has_more})
 */
export function planPagination(config: IronicConfig): PaginationScheme[] {
  if (!config.pagination) return [];
  const raw = Array.isArray(config.pagination) ? config.pagination : [config.pagination];
  const schemes: PaginationScheme[] = [];

  for (const entry of raw) {
    const e = entry as { type?: string; request?: Record<string, unknown>; response?: Record<string, unknown> };
    const type = e.type ?? 'cursor';
    const req = e.request ?? {};
    const resp = e.response ?? {};

    if (type === 'cursor' || type === 'cursor_id' || type === 'cursor_url') {
      schemes.push({
        name: 'cursor',
        type: 'cursor',
        request: {
          cursorParam: (req.cursor_param as string) ?? 'after',
          limitParam: (req.limit_param as string) ?? 'limit',
        },
        response: {
          itemsKey: (resp.items_key as string) ?? 'data',
          hasMoreKey: (resp.has_more_key as string) ?? 'has_more',
          cursorSource: (resp.cursor_source as PaginationScheme['response']['cursorSource']) ?? 'last_item_id',
          cursorField: (resp.cursor_field as string) ?? 'id',
        },
      });
    } else if (type === 'offset' || type === 'page_number') {
      schemes.push({
        name: 'offset',
        type: 'offset',
        request: {
          pageParam: (req.page_param as string) ?? (req.offset_param as string) ?? 'page',
          perPageParam: (req.per_page_param as string) ?? (req.limit_param as string) ?? 'per_page',
        },
        response: {
          itemsKey: (resp.items_key as string) ?? 'data',
          totalKey: (resp.total_key as string) ?? (resp.count_key as string) ?? 'total',
        },
      });
    }
  }

  return schemes;
}
