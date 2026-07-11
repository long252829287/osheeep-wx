import type { RecipeSummary } from '../../types/recipe';

interface OsheeepApp {
  getRecipes: () => Promise<RecipeSummary[]>;
}

Page({
  data: {
    loading: true,
    recipes: [] as RecipeSummary[],
    errorMessage: '',
  },

  async onShow() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const recipes = await getApp<OsheeepApp>().getRecipes();
      this.setData({ recipes });
    } catch {
      this.setData({ errorMessage: '菜谱加载失败，请稍后重试' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
