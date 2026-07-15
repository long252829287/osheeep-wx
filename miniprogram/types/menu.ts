import type { RecipeSummary } from './recipe';

export type MenuStatus = 'DRAFT' | 'CONFIRMED' | 'COMPLETED';
export type MenuDishSource = 'ME' | 'PARTNER' | 'BOTH';

export interface MenuDish extends Omit<
  RecipeSummary,
  'id' | 'ingredients' | 'match'
> {
  recipeId: number;
  source: MenuDishSource;
}

export interface TodayMenu {
  id: number;
  menuDate: string;
  status: MenuStatus;
  version: number;
  mySelectionCount: number;
  partnerSelectionCount: number;
  consensusCount: number;
  selectedRecipeIds: number[];
  dishes: MenuDish[];
  confirmedBy?: number;
  confirmedAt?: string;
  completedBy?: number;
  completedAt?: string;
  recordId?: number;
}

export interface CompleteMenuResult {
  recordId: number;
  menu: TodayMenu;
}
