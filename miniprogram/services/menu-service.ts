import type { RequestInit } from '../types/api';
import type { CompleteMenuResult, TodayMenu } from '../types/menu';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

export const createMenuService = (options: { request: RequestFunction }) => ({
  getToday: () => options.request<TodayMenu>('/api/dinner/menus/today'),

  saveSelections: (recipeIds: number[], version: number) =>
    options.request<TodayMenu>('/api/dinner/menus/today/selections', {
      method: 'PUT',
      data: { recipeIds, version },
    }),

  confirm: (version: number, idempotencyKey: string) =>
    options.request<TodayMenu>('/api/dinner/menus/today/confirm', {
      method: 'POST',
      data: { version, idempotencyKey },
    }),

  complete: (version: number, idempotencyKey: string) =>
    options.request<CompleteMenuResult>('/api/dinner/menus/today/complete', {
      method: 'POST',
      data: { version, idempotencyKey },
    }),
});
