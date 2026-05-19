// File generated from your OpenAPI spec by Ironic. See https://ironic.dev for details.

import type { Pet } from './shared.js';

export interface ListPetsResponse {
  data: Pet[];
  has_more: boolean;
}

export interface PetListPetsParams {
  after?: string;
  limit?: number;
}
