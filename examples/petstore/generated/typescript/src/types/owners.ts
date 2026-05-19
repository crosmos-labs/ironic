import type { Owner } from './shared.js';

export interface ListOwnersResponse {
  data: Owner[];
  total: number;
}

export interface OwnerListOwnersParams {
  limit?: number;
}
