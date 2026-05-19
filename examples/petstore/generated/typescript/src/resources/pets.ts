import { APIResource } from '../core/api-client.js';
import type { CreatePetRequest, Pet, UpdatePetRequest } from '../types/index.js';

export class Pets extends APIResource {

  /**
   * Create a new pet in the store.
   *
   * @param body Request body
   */

  async createPet(body: CreatePetRequest): Promise<Pet> {
    return this._client.post('/pets', { body });
    }

  /**
   * Delete a pet
   */

  async deletePet(petId: string): Promise<void> {
    return this._client.delete(`/pets/${petId}`);
    }

  /**
   * Get a pet by ID
   */

  async getPet(petId: string): Promise<Pet> {
    return this._client.get(`/pets/${petId}`);
    }

  /**
   * Returns a paginated list of pets.
   */

  async listPets(query?: { after?: string; limit?: number }): Promise<{
    data: Pet[];
    has_more: boolean;
  }> {
    return this._client.get('/pets', { query });
    }

  /**
   * Update a pet
   *
   * @param body Request body
   */

  async updatePet(petId: string, body: UpdatePetRequest): Promise<Pet> {
    return this._client.patch(`/pets/${petId}`, { body });
    }
}
