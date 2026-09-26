import type { components } from './schema';

/** Response and request shapes, generated from the API's OpenAPI document (`npm run gen:api`). */
export type Schemas = components['schemas'];

/** The API's error body: always `{ statusCode, error, message }`. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
}
