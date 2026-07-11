import { ApiError } from '../../services/request';
import type { TodayMenu } from '../../types/menu';
import type { RecipeSummary } from '../../types/recipe';
import { toMenuErrorMessage } from '../../utils/menu-errors';

interface OsheeepApp {
  getRecipes: () => Promise<RecipeSummary[]>;
  getTodayMenu: () => Promise<TodayMenu>;
  saveSelections: (recipeIds: number[], version: number) => Promise<TodayMenu>;
}

interface RecipeView extends RecipeSummary {
  selected: boolean;
}

let selectedIds = new Set<number>();
let baseVersion = 0;

Page({
  data: {
    loading: true,
    recipes: [] as RecipeView[],
    selectedCount: 0,
    saving: false,
    completed: false,
    errorMessage: '',
    conflictMessage: '',
  },

  async onShow() {
    this.setData({ loading: true, errorMessage: '', conflictMessage: '' });
    try {
      const app = getApp<OsheeepApp>();
      const [recipes, menu] = await Promise.all([
        app.getRecipes(),
        app.getTodayMenu(),
      ]);
      selectedIds = new Set(menu.selectedRecipeIds);
      baseVersion = menu.version;
      this.setData({
        recipes: recipes.map((recipe) => ({
          ...recipe,
          selected: selectedIds.has(recipe.id),
        })),
        selectedCount: selectedIds.size,
        completed: menu.status === 'COMPLETED',
      });
    } catch (error) {
      this.setData({ errorMessage: this.getErrorMessage(error) });
    } finally {
      this.setData({ loading: false });
    }
  },

  onToggleRecipe(event: WechatMiniprogram.TouchEvent) {
    if (this.data.completed) return;
    const recipeId = Number(event.currentTarget.dataset.id);
    if (selectedIds.has(recipeId)) selectedIds.delete(recipeId);
    else selectedIds.add(recipeId);
    this.setData({
      recipes: this.data.recipes.map((recipe) => ({
        ...recipe,
        selected: selectedIds.has(recipe.id),
      })),
      selectedCount: selectedIds.size,
      conflictMessage: '',
    });
  },

  async onSaveSelections() {
    if (this.data.completed) {
      wx.reLaunch({ url: '/pages/tonight/index' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true, errorMessage: '' });
    try {
      await getApp<OsheeepApp>().saveSelections(
        [...selectedIds].sort((left, right) => left - right),
        baseVersion,
      );
      wx.reLaunch({ url: '/pages/tonight/index' });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.errorCode === 'DINNER_MENU_VERSION_CONFLICT'
      ) {
        await this.recoverFromConflict();
      } else {
        this.setData({ errorMessage: this.getErrorMessage(error) });
      }
    } finally {
      this.setData({ saving: false });
    }
  },

  async recoverFromConflict() {
    try {
      const latest = await getApp<OsheeepApp>().getTodayMenu();
      baseVersion = latest.version;
      this.setData({
        conflictMessage: toMenuErrorMessage('DINNER_MENU_VERSION_CONFLICT'),
      });
    } catch (error) {
      this.setData({ errorMessage: this.getErrorMessage(error) });
    }
  },

  getErrorMessage(error: unknown) {
    return error instanceof ApiError
      ? toMenuErrorMessage(error.errorCode)
      : '操作失败，请稍后重试';
  },
});
