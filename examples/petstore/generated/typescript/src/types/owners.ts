// File generated from your OpenAPI spec by Ironic. See https://ironic.dev for details.

import type { Owner } from './shared.js';

export interface ListOwnersResponse {
  data: Owner[];
  total: number;
}

export interface OwnerListOwnersParams {
  limit?: number;
}
