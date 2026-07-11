import type { RequestInit } from '../types/api';
import type { RecipeSummary } from '../types/recipe';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

export const createRecipeService = (options: { request: RequestFunction }) => ({
  list: () => options.request<RecipeSummary[]>('/api/dinner/recipes'),
});
