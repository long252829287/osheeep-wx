import type { RequestInit } from '../types/api';
import type {
  Ingredient,
  InventoryItem,
  SaveInventoryItemInput,
} from '../types/ingredient';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

export const createIngredientService = (options: {
  request: RequestFunction;
}) => ({
  listIngredients: () =>
    options.request<Ingredient[]>('/api/dinner/ingredients'),

  listInventory: () =>
    options.request<InventoryItem[]>('/api/dinner/inventory'),

  saveInventoryItem: (ingredientId: number, input: SaveInventoryItemInput) =>
    options.request<InventoryItem>(
      `/api/dinner/inventory/${String(ingredientId)}`,
      { method: 'PUT', data: { ...input } },
    ),

  removeInventoryItem: (ingredientId: number, version: number) =>
    options.request<void>(
      `/api/dinner/inventory/${String(ingredientId)}?version=${String(version)}`,
      { method: 'DELETE' },
    ),
});
