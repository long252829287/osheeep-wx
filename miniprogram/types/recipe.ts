export interface RecipeIngredient {
  ingredientId: number;
  name: string;
  quantity?: number | null;
  unit: string;
  required: boolean;
  sortOrder: number;
}

export interface RecipeMatch {
  status: 'AVAILABLE' | 'UNKNOWN_QUANTITY' | 'MISSING';
  matchedRequired: number;
  totalRequired: number;
  matchPercent: number;
  missingIngredients: string[];
  unknownQuantityIngredients: string[];
}

export interface RecipeSummary {
  id: number;
  name: string;
  imagePath?: string;
  category: string;
  flavor: string;
  estimatedMinutes: number;
  ingredients: RecipeIngredient[];
  match: RecipeMatch;
}

export interface RecipeDiscoveryQuery {
  includeIngredientIds?: number[];
  excludeIngredientIds?: number[];
  onlyCookable?: boolean;
}
