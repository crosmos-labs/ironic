import type { Pet } from './shared.js';

export interface ListPetsResponse {
  data: Pet[];
  has_more: boolean;
}
