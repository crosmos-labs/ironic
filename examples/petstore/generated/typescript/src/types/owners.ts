export interface GetOwnerResponse {
  email: string;
  id: string;
  name: string;
  /** List of pet IDs */
  pets?: string[];
}

export interface ListOwnersResponse {
  data: {
  email: string;
  id: string;
  name: string;
  pets?: string[];
}[];
  total: number;
}
