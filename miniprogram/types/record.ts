import type { MenuDishSource } from './menu';
import type { RecipeScope } from './recipe';

export interface RecordMethodStepSnapshot {
  instruction: string;
  sortOrder: number;
}

export interface RecordMethodSnapshot {
  id: number;
  name: string;
  cookingStyle: string;
  steps: RecordMethodStepSnapshot[];
}

export interface RecordIngredientSnapshot {
  ingredientId: number;
  name: string;
  quantity: number | null;
  unit: string;
  required: boolean;
  sortOrder: number;
}

export interface RecordDish {
  recipeId: number;
  name: string;
  imagePath: string | null;
  category: string;
  flavor: string;
  estimatedMinutes: number;
  source: MenuDishSource;
  scope: RecipeScope;
  recipeVersion: number;
  servings: number | null;
  method: RecordMethodSnapshot | null;
  ingredients: RecordIngredientSnapshot[];
}

export interface RecordSummary {
  id: number;
  recordDate: string;
  completedBy: number;
  completedAt: string;
  dishCount: number;
}

export interface RecordDetail {
  id: number;
  recordDate: string;
  completedBy: number;
  completedAt: string;
  dishes: RecordDish[];
}
