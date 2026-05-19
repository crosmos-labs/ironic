import { APIResource } from '../core/api-client.js';
import type { RequestOptions } from '../core/types.js';
import { APIPromise } from '../core/api-promise.js';
import { CursorPage } from '../core/pagination.js';
import type { CreatePetRequest, Pet, PetListPetsParams, UpdatePetRequest } from '../types/index.js';

export class Pets extends APIResource {

  /**
   * Create a new pet in the store.
   *
   * @param body Request body
   */

  createPet(body: CreatePetRequest, options?: RequestOptions): APIPromise<Pet> {
    return this._client.post('/pets', { ...options, body });
  }

  /**
   * Delete a pet
   */

  deletePet(petId: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(`/pets/${petId}`, { ...options });
  }

  /**
   * Get a pet by ID
   */

  getPet(petId: string, options?: RequestOptions): APIPromise<Pet> {
    return this._client.get(`/pets/${petId}`, { ...options });
  }

  /**
   * Returns a paginated list of pets.
   */

  async listPets(query?: PetListPetsParams, options?: RequestOptions): Promise<CursorPage<Pet>> {
    return this._client.getAPIList<Pet, CursorPage<Pet>>('/pets', CursorPage, { ...options, query });
  }

  /**
   * Update a pet
   *
   * @param body Request body
   */

  updatePet(petId: string, body: UpdatePetRequest, options?: RequestOptions): APIPromise<Pet> {
    return this._client.patch(`/pets/${petId}`, { ...options, body });
  }
}
