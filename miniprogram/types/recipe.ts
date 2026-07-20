export interface RecipeIngredient {
  ingredientId: number | null;
  name: string | null;
  quantity: number | null;
  unit: string | null;
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

export type FamilyRecipeTab = 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

export type RecipeStep =
  'BASIC' | 'INGREDIENTS' | 'METHOD' | 'IMAGE' | 'PREVIEW';

export interface FamilyRecipeListItem {
  id: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  name: string | null;
  imageUrl: string | null;
  category: string | null;
  flavor: string | null;
  servings: number | null;
  estimatedMinutes: number | null;
  version: number;
  creatorId: number | null;
  creatorName: string | null;
  lastModifiedBy: number | null;
  lastModifiedByName: string | null;
  completedStep: RecipeStep;
  updatedAt: string | null;
}

export interface RecipeImageAsset {
  id: number;
  displayName: string;
  listUrl: string;
  detailUrl: string;
  sourcePageUrl: string;
  author: string;
  licenseName: string;
  licenseUrl: string;
  acquiredOn: string;
  width: number;
  height: number;
}

export interface RecipeMethodStepDraft {
  instruction: string | null;
  sortOrder: number;
}

export interface RecipeMethodDraft {
  id: number;
  name: string | null;
  cookingStyle: string | null;
  steps: RecipeMethodStepDraft[] | null;
}

export interface RecipeDraft {
  id: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  name: string | null;
  category: string | null;
  flavor: string | null;
  servings: number | null;
  estimatedMinutes: number | null;
  ingredients: RecipeIngredient[];
  defaultMethod: RecipeMethodDraft | null;
  image: RecipeImageAsset | null;
  incompleteSteps: RecipeStep[];
  updatedAt: string | null;
}

export interface RecipeBasicInfoInput {
  version: number;
  name?: string | null;
  category?: string | null;
  flavor?: string | null;
  servings?: number | null;
  estimatedMinutes?: number | null;
}

export interface RecipeIngredientInput {
  ingredientId: number;
  quantity: number | null;
  unit: string;
  required: boolean;
}

export interface RecipeIngredientsInput {
  version: number;
  ingredients: RecipeIngredientInput[];
}

export interface RecipeMethodStepInput {
  instruction: string | null;
}

export interface RecipeDefaultMethodInput {
  version: number;
  name?: string | null;
  cookingStyle?: string | null;
  steps: RecipeMethodStepInput[];
}
