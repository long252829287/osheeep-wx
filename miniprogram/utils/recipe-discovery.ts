import type { InventoryItem } from '../types/ingredient';
import type { RecipeMatch, RecipeSummary } from '../types/recipe';

export interface RecipeCardView extends RecipeSummary {
  matchLabel: string;
}

export interface RecipeDiscoveryView {
  pantrySummary: string;
  featured: RecipeCardView | null;
  rows: RecipeCardView[];
  visibleIngredients: InventoryItem[];
  hasMoreIngredients: boolean;
  onlyCookable: boolean;
}

const matchLabel = (match: RecipeMatch): string => {
  if (match.status === 'AVAILABLE') return '食材齐全';
  if (match.status === 'UNKNOWN_QUANTITY') return '数量待确认';
  return `还缺 ${match.missingIngredients.length} 样`;
};

const toCard = (recipe: RecipeSummary): RecipeCardView => ({
  ...recipe,
  matchLabel: matchLabel(recipe.match),
});

export const toRecipeDiscoveryView = (
  recipes: RecipeSummary[],
  inventory: InventoryItem[],
  onlyCookable: boolean,
): RecipeDiscoveryView => {
  const cards = recipes.slice(0, 3).map(toCard);
  return {
    pantrySummary: `家里有 ${inventory.length} 种食材`,
    featured: cards[0] ?? null,
    rows: cards.slice(1),
    visibleIngredients: inventory.slice(0, 3),
    hasMoreIngredients: inventory.length > 3,
    onlyCookable,
  };
};
