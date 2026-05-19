// File generated from your OpenAPI spec by Ironic. See https://ironic.dev for details.

import { APIResource } from '../core/api-client.js';
import type { RequestOptions } from '../core/types.js';
import { APIPromise } from '../core/api-promise.js';
import { path } from '../core/path.js';
import { CursorPage } from '../core/pagination.js';
import type { Pet, PetCreateParams, PetListPetsParams, PetUpdateParams } from '../types/index.js';

export class Pets extends APIResource {

  /**
   * Create a new pet in the store.
   *
   * @param body Request body
   */

  createPet(body: PetCreateParams, options?: RequestOptions): APIPromise<Pet> {
    return this._client.post('/pets', { ...options, body });
  }

  /**
   * Delete a pet
   */

  deletePet(petId: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/pets/${petId}`, { ...options });
  }

  /**
   * Get a pet by ID
   */

  getPet(petId: string, options?: RequestOptions): APIPromise<Pet> {
    return this._client.get(path`/pets/${petId}`, { ...options });
  }

  /**
   * Returns a paginated list of pets.
   */

  async listPets(query?: PetListPetsParams | null, options?: RequestOptions): Promise<CursorPage<Pet>> {
    return this._client.getAPIList<Pet, CursorPage<Pet>>('/pets', CursorPage, { ...options, query });
  }

  /**
   * Update a pet
   *
   * @param body Request body
   */

  updatePet(petId: string, body: PetUpdateParams, options?: RequestOptions): APIPromise<Pet> {
    return this._client.patch(path`/pets/${petId}`, { ...options, body });
  }
}

export declare namespace Pets {
  export {
    type Pet as Pet,
    type PetCreateParams as PetCreateParams,
    type PetListPetsParams as PetListPetsParams,
    type PetUpdateParams as PetUpdateParams,
  };
}
