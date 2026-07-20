import type {
  FamilyRecipeListItem,
  FamilyRecipeTab,
  RecipeDraft,
} from '../../types/recipe';

interface OsheeepApp {
  listFamilyRecipes: (tab: FamilyRecipeTab) => Promise<FamilyRecipeListItem[]>;
  createRecipeDraft: () => Promise<RecipeDraft>;
}

const FAMILY_RECIPE_TABS: readonly FamilyRecipeTab[] = [
  'PUBLISHED',
  'DRAFT',
  'ARCHIVED',
];

let listRequestToken = 0;

const isFamilyRecipeTab = (value: unknown): value is FamilyRecipeTab =>
  typeof value === 'string' &&
  FAMILY_RECIPE_TABS.includes(value as FamilyRecipeTab);

Page({
  data: {
    activeTab: 'PUBLISHED' as FamilyRecipeTab,
    loading: true,
    refreshing: false,
    creating: false,
    items: [] as FamilyRecipeListItem[],
    errorMessage: '',
  },

  onLoad(query: { tab?: string }) {
    this.setData({
      activeTab: isFamilyRecipeTab(query.tab) ? query.tab : 'PUBLISHED',
    });
  },

  async onShow() {
    await this.loadActiveTab();
  },

  async onRetry() {
    await this.loadActiveTab();
  },

  async onSelectTab(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab;
    if (!isFamilyRecipeTab(tab)) return;

    if (tab !== this.data.activeTab) {
      this.setData({
        activeTab: tab,
        loading: true,
        refreshing: false,
        items: [],
        errorMessage: '',
      });
    }
    await this.loadActiveTab();
  },

  async loadActiveTab() {
    const tab = this.data.activeTab;
    const token = ++listRequestToken;
    const hasRows = this.data.items.length > 0;
    this.setData({
      loading: !hasRows,
      refreshing: hasRows,
      errorMessage: '',
    });

    try {
      const items = await getApp<OsheeepApp>().listFamilyRecipes(tab);
      if (token !== listRequestToken || this.data.activeTab !== tab) return;
      this.setData({ items });
    } catch {
      if (token !== listRequestToken || this.data.activeTab !== tab) return;
      this.setData({ errorMessage: '暂时加载失败，请稍后重试' });
    } finally {
      if (token === listRequestToken && this.data.activeTab === tab) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  },

  async onCreateDraft() {
    if (this.data.creating) return;
    this.setData({ creating: true, errorMessage: '' });

    try {
      const created = await getApp<OsheeepApp>().createRecipeDraft();
      wx.navigateTo({
        url: `/pages/recipe-editor/index?id=${String(created.id)}`,
      });
    } catch {
      this.setData({ errorMessage: '新建菜谱失败，请稍后再试' });
    } finally {
      this.setData({ creating: false });
    }
  },

  onOpenRecipe(event: WechatMiniprogram.TouchEvent) {
    const id = Number(event.currentTarget.dataset.id);
    if (!Number.isFinite(id) || id <= 0) return;
    wx.navigateTo({ url: `/pages/recipe-editor/index?id=${String(id)}` });
  },
});
