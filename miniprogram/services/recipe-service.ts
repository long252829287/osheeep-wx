import type { RequestInit } from '../types/api';
import type {
  FamilyRecipeListItem,
  FamilyRecipeTab,
  RecipeBasicInfoInput,
  RecipeDefaultMethodInput,
  RecipeDiscoveryQuery,
  RecipeDraft,
  RecipeImageAsset,
  RecipeIngredientsInput,
  RecipeSummary,
} from '../types/recipe';

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
  listFamily: (tab: FamilyRecipeTab) =>
    options.request<FamilyRecipeListItem[]>(
      `/api/dinner/recipes/family?tab=${tab}`,
    ),
  createDraft: () =>
    options.request<RecipeDraft>('/api/dinner/recipes/drafts', {
      method: 'POST',
    }),
  detail: (id: number) =>
    options.request<RecipeDraft>(`/api/dinner/recipes/${id}`),
  saveBasicInfo: (id: number, input: RecipeBasicInfoInput) =>
    options.request<RecipeDraft>(`/api/dinner/recipes/${id}/basic-info`, {
      method: 'PUT',
      data: { ...input },
    }),
  saveIngredients: (id: number, input: RecipeIngredientsInput) =>
    options.request<RecipeDraft>(`/api/dinner/recipes/${id}/ingredients`, {
      method: 'PUT',
      data: { ...input },
    }),
  saveDefaultMethod: (id: number, input: RecipeDefaultMethodInput) =>
    options.request<RecipeDraft>(`/api/dinner/recipes/${id}/default-method`, {
      method: 'PUT',
      data: { ...input },
    }),
  saveImage: (id: number, version: number, imageAssetId: number | null) =>
    options.request<RecipeDraft>(`/api/dinner/recipes/${id}/image`, {
      method: 'PUT',
      data: { version, imageAssetId },
    }),
  listImages: (query: string) =>
    options.request<RecipeImageAsset[]>(
      `/api/dinner/image-assets?query=${encodeURIComponent(query)}`,
    ),
  publish: (id: number, version: number) =>
    options.request<RecipeDraft>(`/api/dinner/recipes/${id}/publish`, {
      method: 'POST',
      data: { version },
    }),
});
