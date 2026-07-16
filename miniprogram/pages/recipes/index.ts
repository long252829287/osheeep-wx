import { ApiError } from '../../services/request';
import type { InventoryItem } from '../../types/ingredient';
import type { TodayMenu } from '../../types/menu';
import type { RecipeDiscoveryQuery, RecipeSummary } from '../../types/recipe';
import {
  toRecipeDiscoveryView,
  type RecipeCardView,
} from '../../utils/recipe-discovery';
import { toMenuErrorMessage } from '../../utils/menu-errors';

interface OsheeepApp {
  getInventory: () => Promise<InventoryItem[]>;
  getRecipes: (query: RecipeDiscoveryQuery) => Promise<RecipeSummary[]>;
  getTodayMenu: () => Promise<TodayMenu>;
  saveSelections: (recipeIds: number[], version: number) => Promise<TodayMenu>;
}

interface PageRecipeCard extends RecipeCardView {
  added: boolean;
}

type FilterState = 'neutral' | 'include' | 'exclude';

interface FilterIngredient {
  ingredientId: number;
  name: string;
  state: FilterState;
  stateLabel: string;
}

interface DiscoveryData {
  loading: boolean;
  refreshing: boolean;
  recipesLoaded: boolean;
  inventory: InventoryItem[];
  featured: PageRecipeCard | null;
  rows: PageRecipeCard[];
  pantrySummary: string;
  visibleIngredients: InventoryItem[];
  hasMoreIngredients: boolean;
  filtersOpen: boolean;
  selectableIngredients: FilterIngredient[];
  onlyCookable: boolean;
  includeIngredientIds: number[];
  excludeIngredientIds: number[];
  menuId: number;
  menuDate: string;
  menuVersion: number;
  mySelectedRecipeIds: number[];
  savingRecipeId: number;
  pendingRecipeId: number;
  loadErrorMessage: string;
  refreshMessage: string;
  actionMessage: string;
  conflictMessage: string;
}

let showRequestToken = 0;
let recipeRequestToken = 0;
let menuReadRequestToken = 0;
let menuOperationToken = 0;

const errorCodeOf = (error: unknown): string | undefined => {
  if (error instanceof ApiError) return error.errorCode;
  if (
    typeof error === 'object' &&
    error !== null &&
    'errorCode' in error &&
    typeof error.errorCode === 'string'
  ) {
    return error.errorCode;
  }
  return undefined;
};

const requestErrorMessage = (error: unknown): string => {
  const errorCode = errorCodeOf(error);
  return errorCode ? toMenuErrorMessage(errorCode) : '暂时加载失败，请稍后重试';
};

const sortedUniqueIds = (ids: number[]): number[] =>
  [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))].sort(
    (left, right) => left - right,
  );

const normalizedFilterIds = (
  includeIds: number[],
  excludeIds: number[],
): { includeIds: number[]; excludeIds: number[] } => {
  const exclude = sortedUniqueIds(excludeIds);
  const excluded = new Set(exclude);
  return {
    includeIds: sortedUniqueIds(includeIds).filter((id) => !excluded.has(id)),
    excludeIds: exclude,
  };
};

const filterStateLabel = (state: FilterState): string => {
  if (state === 'include') return '想吃';
  if (state === 'exclude') return '排除';
  return '不限';
};

const filterIngredients = (
  inventory: InventoryItem[],
  recipes: RecipeSummary[],
  previous: FilterIngredient[],
  includeIds: number[],
  excludeIds: number[],
): FilterIngredient[] => {
  const names = new Map<number, string>();
  for (const item of previous) names.set(item.ingredientId, item.name);
  for (const item of inventory) names.set(item.ingredientId, item.name);
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      names.set(ingredient.ingredientId, ingredient.name);
    }
  }
  const include = new Set(includeIds);
  const exclude = new Set(excludeIds);
  return [...names]
    .sort(([left], [right]) => left - right)
    .map(([ingredientId, name]) => {
      const state: FilterState = exclude.has(ingredientId)
        ? 'exclude'
        : include.has(ingredientId)
          ? 'include'
          : 'neutral';
      return {
        ingredientId,
        name,
        state,
        stateLabel: filterStateLabel(state),
      };
    });
};

const recipeSummariesFrom = (data: DiscoveryData): RecipeSummary[] => [
  ...(data.featured ? [data.featured] : []),
  ...data.rows,
];

const decorateCard = (
  card: RecipeCardView,
  selectedIds: number[],
): PageRecipeCard => ({
  ...card,
  added: selectedIds.includes(card.id),
});

Page({
  data: {
    loading: true,
    refreshing: false,
    recipesLoaded: false,
    inventory: [] as InventoryItem[],
    featured: null as PageRecipeCard | null,
    rows: [] as PageRecipeCard[],
    pantrySummary: '家里有 0 种食材',
    visibleIngredients: [] as InventoryItem[],
    hasMoreIngredients: false,
    ingredientsExpanded: false,
    filtersOpen: false,
    selectableIngredients: [] as FilterIngredient[],
    onlyCookable: false,
    includeIngredientIds: [] as number[],
    excludeIngredientIds: [] as number[],
    menuId: 0,
    menuDate: '',
    menuVersion: 0,
    mySelectedRecipeIds: [] as number[],
    savingRecipeId: 0,
    pendingRecipeId: 0,
    loadErrorMessage: '',
    refreshMessage: '',
    actionMessage: '',
    conflictMessage: '',
  },

  async onShow() {
    const showToken = ++showRequestToken;
    const recipesToken = ++recipeRequestToken;
    const menuReadToken = ++menuReadRequestToken;
    const hasLoadedRecipes = this.data.recipesLoaded;
    this.setData({
      loading: !hasLoadedRecipes,
      refreshing: hasLoadedRecipes,
      loadErrorMessage: '',
      refreshMessage: '',
      actionMessage: '',
    });

    const app = getApp<OsheeepApp>();
    const inventoryRequest = app
      .getInventory()
      .then((inventory) => {
        if (showToken !== showRequestToken) return;
        this.applyInventory(inventory);
      })
      .catch((error: unknown) => {
        if (showToken !== showRequestToken) return;
        this.setData({ loadErrorMessage: requestErrorMessage(error) });
      });
    const recipesRequest = app
      .getRecipes(this.currentQuery())
      .then((recipes) => {
        if (recipesToken !== recipeRequestToken) return;
        this.applyRecipes(recipes);
      })
      .catch((error: unknown) => {
        if (recipesToken !== recipeRequestToken) return;
        const message = requestErrorMessage(error);
        this.setData(
          hasLoadedRecipes
            ? { refreshMessage: message }
            : { loadErrorMessage: message },
        );
      });
    const menuRequest = app
      .getTodayMenu()
      .then((menu) => {
        if (menuReadToken !== menuReadRequestToken) return;
        this.applyMenu(menu);
      })
      .catch((error: unknown) => {
        if (menuReadToken !== menuReadRequestToken) return;
        this.setData({ loadErrorMessage: requestErrorMessage(error) });
      });

    await Promise.allSettled([inventoryRequest, recipesRequest, menuRequest]);
    if (showToken === showRequestToken) this.setData({ loading: false });
    if (recipesToken === recipeRequestToken) {
      this.setData({ refreshing: false });
    }
  },

  async onRetry() {
    await this.onShow();
  },

  currentQuery(): RecipeDiscoveryQuery {
    const { includeIds, excludeIds } = normalizedFilterIds(
      this.data.includeIngredientIds,
      this.data.excludeIngredientIds,
    );
    return {
      includeIngredientIds: includeIds,
      excludeIngredientIds: excludeIds,
      onlyCookable: this.data.onlyCookable,
    };
  },

  applyInventory(inventory: InventoryItem[]) {
    const view = toRecipeDiscoveryView(
      recipeSummariesFrom(this.data),
      inventory,
      this.data.onlyCookable,
    );
    this.setData({
      inventory,
      pantrySummary: view.pantrySummary,
      visibleIngredients: view.visibleIngredients,
      hasMoreIngredients: view.hasMoreIngredients,
      selectableIngredients: filterIngredients(
        inventory,
        recipeSummariesFrom(this.data),
        this.data.selectableIngredients,
        this.data.includeIngredientIds,
        this.data.excludeIngredientIds,
      ),
    });
  },

  applyRecipes(recipes: RecipeSummary[]) {
    const view = toRecipeDiscoveryView(
      recipes,
      this.data.inventory,
      this.data.onlyCookable,
    );
    this.setData({
      recipesLoaded: true,
      featured: view.featured
        ? decorateCard(view.featured, this.data.mySelectedRecipeIds)
        : null,
      rows: view.rows.map((row) =>
        decorateCard(row, this.data.mySelectedRecipeIds),
      ),
      pantrySummary: view.pantrySummary,
      visibleIngredients: view.visibleIngredients,
      hasMoreIngredients: view.hasMoreIngredients,
      selectableIngredients: filterIngredients(
        this.data.inventory,
        recipes,
        this.data.selectableIngredients,
        this.data.includeIngredientIds,
        this.data.excludeIngredientIds,
      ),
      refreshMessage: '',
    });
  },

  applyMenu(menu: TodayMenu): boolean {
    const sameIdentity =
      menu.id === this.data.menuId && menu.menuDate === this.data.menuDate;
    if (sameIdentity && menu.version < this.data.menuVersion) return false;
    if (
      !sameIdentity &&
      this.data.menuDate &&
      menu.menuDate < this.data.menuDate
    ) {
      return false;
    }
    const mySelectedRecipeIds = sortedUniqueIds(menu.selectedRecipeIds);
    this.setData({
      menuId: menu.id,
      menuDate: menu.menuDate,
      menuVersion: menu.version,
      mySelectedRecipeIds,
      featured: this.data.featured
        ? decorateCard(this.data.featured, mySelectedRecipeIds)
        : null,
      rows: this.data.rows.map((row) => decorateCard(row, mySelectedRecipeIds)),
    });
    return true;
  },

  async reloadRecipes() {
    const token = ++recipeRequestToken;
    const { includeIds, excludeIds } = normalizedFilterIds(
      this.data.includeIngredientIds,
      this.data.excludeIngredientIds,
    );
    this.setData({
      includeIngredientIds: includeIds,
      excludeIngredientIds: excludeIds,
      refreshing: true,
      refreshMessage: '',
      actionMessage: '',
    });
    try {
      const recipes = await getApp<OsheeepApp>().getRecipes({
        includeIngredientIds: includeIds,
        excludeIngredientIds: excludeIds,
        onlyCookable: this.data.onlyCookable,
      });
      if (token !== recipeRequestToken) return;
      this.applyRecipes(recipes);
    } catch (error) {
      if (token !== recipeRequestToken) return;
      this.setData({ refreshMessage: requestErrorMessage(error) });
    } finally {
      if (token === recipeRequestToken) this.setData({ refreshing: false });
    }
  },

  onToggleFiltersPanel() {
    this.setData({ filtersOpen: !this.data.filtersOpen });
  },

  onToggleIngredientsExpanded() {
    this.setData({ ingredientsExpanded: !this.data.ingredientsExpanded });
  },

  async onCycleIngredientFilter(event: WechatMiniprogram.TouchEvent) {
    const ingredientId = Number(event.currentTarget.dataset.id);
    if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
    const include = new Set(this.data.includeIngredientIds);
    const exclude = new Set(this.data.excludeIngredientIds);
    if (exclude.has(ingredientId)) {
      exclude.delete(ingredientId);
    } else if (include.has(ingredientId)) {
      include.delete(ingredientId);
      exclude.add(ingredientId);
    } else {
      include.add(ingredientId);
      exclude.delete(ingredientId);
    }
    const { includeIds, excludeIds } = normalizedFilterIds(
      [...include],
      [...exclude],
    );
    this.setData({
      includeIngredientIds: includeIds,
      excludeIngredientIds: excludeIds,
      selectableIngredients: filterIngredients(
        this.data.inventory,
        recipeSummariesFrom(this.data),
        this.data.selectableIngredients,
        includeIds,
        excludeIds,
      ),
    });
    await this.reloadRecipes();
  },

  async onResetFilters() {
    this.setData({
      onlyCookable: false,
      includeIngredientIds: [],
      excludeIngredientIds: [],
      selectableIngredients: filterIngredients(
        this.data.inventory,
        recipeSummariesFrom(this.data),
        this.data.selectableIngredients,
        [],
        [],
      ),
    });
    await this.reloadRecipes();
  },

  async onToggleOnlyCookable(event: WechatMiniprogram.SwitchChange) {
    this.setData({ onlyCookable: event.detail.value });
    await this.reloadRecipes();
  },

  async onAddToTonight(event: WechatMiniprogram.TouchEvent) {
    const recipeId = Number(event.currentTarget.dataset.id);
    if (!Number.isFinite(recipeId) || recipeId <= 0 || this.data.savingRecipeId)
      return;
    if (this.data.mySelectedRecipeIds.includes(recipeId)) {
      this.setData({
        actionMessage: '这道菜已经在今晚菜单里',
        conflictMessage: '',
      });
      return;
    }

    const nextIds = sortedUniqueIds([
      ...this.data.mySelectedRecipeIds,
      recipeId,
    ]);
    const operationToken = ++menuOperationToken;
    this.setData({
      savingRecipeId: recipeId,
      actionMessage: '',
      conflictMessage: '',
    });
    try {
      const saved = await getApp<OsheeepApp>().saveSelections(
        nextIds,
        this.data.menuVersion,
      );
      if (operationToken !== menuOperationToken) return;
      const applied = this.applyMenu({ ...saved, selectedRecipeIds: nextIds });
      if (!applied) return;
      this.setData({ pendingRecipeId: 0 });
      wx.showToast({ title: '已加入今晚菜单', icon: 'success' });
    } catch (error) {
      if (operationToken !== menuOperationToken) return;
      if (errorCodeOf(error) === 'DINNER_MENU_VERSION_CONFLICT') {
        await this.recoverMenuConflict(recipeId, operationToken);
        return;
      }
      this.setData({ actionMessage: requestErrorMessage(error) });
    } finally {
      if (
        operationToken === menuOperationToken &&
        this.data.savingRecipeId === recipeId
      ) {
        this.setData({ savingRecipeId: 0 });
      }
    }
  },

  async recoverMenuConflict(recipeId: number, activeOperationToken?: number) {
    const operationToken = activeOperationToken ?? ++menuOperationToken;
    this.setData({
      pendingRecipeId: recipeId,
      conflictMessage:
        '今晚菜单刚刚有更新，已保留这道菜，请确认最新菜单后重新尝试',
    });
    try {
      const latest = await getApp<OsheeepApp>().getTodayMenu();
      if (operationToken !== menuOperationToken) return;
      this.applyMenu(latest);
    } catch (error) {
      if (operationToken !== menuOperationToken) return;
      this.setData({ actionMessage: requestErrorMessage(error) });
    }
  },

  onOpenHouseholdRecipes() {
    wx.showToast({ title: '家庭菜谱暂未开放', icon: 'none' });
  },

  onOpenIngredients() {
    wx.navigateTo({ url: '/pages/ingredients/index' });
  },
});
