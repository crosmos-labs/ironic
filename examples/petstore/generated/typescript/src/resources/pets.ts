import { APIResource } from '../core/api-client.js';
import type { RequestOptions } from '../core/types.js';
import { CursorPage } from '../core/pagination.js';
import type { CreatePetRequest, Pet, PetListPetsParams, UpdatePetRequest } from '../types/index.js';

export class Pets extends APIResource {

  /**
   * Create a new pet in the store.
   *
   * @param body Request body
   */

  async createPet(body: CreatePetRequest, options?: RequestOptions): Promise<Pet> {
    return this._client.post('/pets', { ...options, body });
  }

  /**
   * Delete a pet
   */

  async deletePet(petId: string, options?: RequestOptions): Promise<void> {
    return this._client.delete(`/pets/${petId}`, { ...options });
  }

  /**
   * Get a pet by ID
   */

  async getPet(petId: string, options?: RequestOptions): Promise<Pet> {
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

  async updatePet(petId: string, body: UpdatePetRequest, options?: RequestOptions): Promise<Pet> {
    return this._client.patch(`/pets/${petId}`, { ...options, body });
  }
}
