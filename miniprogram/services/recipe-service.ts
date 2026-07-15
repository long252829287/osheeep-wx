import type { RequestInit } from '../types/api';
import type { RecipeDiscoveryQuery, RecipeSummary } from '../types/recipe';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

const queryString = (query: RecipeDiscoveryQuery): string => {
  const parts: string[] = [];
  if (query.includeIngredientIds?.length) {
    parts.push(
      `includeIngredientIds=${query.includeIngredientIds.map(String).join(',')}`,
    );
  }
  if (query.excludeIngredientIds?.length) {
    parts.push(
      `excludeIngredientIds=${query.excludeIngredientIds.map(String).join(',')}`,
    );
  }
  if (query.onlyCookable) parts.push('onlyCookable=true');
  return parts.length ? `?${parts.join('&')}` : '';
};

export const createRecipeService = (options: { request: RequestFunction }) => ({
  list: (query: RecipeDiscoveryQuery = {}) =>
    options.request<RecipeSummary[]>(
      `/api/dinner/recipes${queryString(query)}`,
    ),
});
