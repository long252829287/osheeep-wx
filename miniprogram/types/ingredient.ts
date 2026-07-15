export interface Ingredient {
  id: number;
  name: string;
  category: string;
  defaultUnit: string;
}

export interface InventoryItem {
  ingredientId: number;
  name: string;
  category: string;
  quantity?: number | null;
  unit: string;
  version: number;
  updatedBy: number;
  updatedAt: string;
}

export interface SaveInventoryItemInput {
  quantity?: number | null;
  unit: string;
  version: number;
}
