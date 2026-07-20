import type {
  FamilyRecipeListItem,
  FamilyRecipeTab,
  RecipeDraft,
} from '../../types/recipe';

interface OsheeepApp {
  listFamilyRecipes: (tab: FamilyRecipeTab) => Promise<FamilyRecipeListItem[]>;
  createRecipeDraft: () => Promise<RecipeDraft>;
}

type FamilyRecipesErrorSource = '' | 'LIST' | 'CREATE' | 'OPEN_DRAFT';

interface DeferredFeedback {
  source: Exclude<FamilyRecipesErrorSource, '' | 'LIST'>;
  message: string;
}

interface FamilyRecipesRuntime {
  visible: boolean;
  destroyed: boolean;
  listRequestToken: number;
  editorOperationInFlight: boolean;
  pendingDraftId: number | null;
  retryOpenRecipeId: number | null;
  deferredFeedback: DeferredFeedback | null;
}

const FAMILY_RECIPE_TABS: readonly FamilyRecipeTab[] = [
  'PUBLISHED',
  'DRAFT',
  'ARCHIVED',
];

const pageRuntimes = new WeakMap<object, FamilyRecipesRuntime>();

const runtimeFor = (page: object): FamilyRecipesRuntime => {
  const existing = pageRuntimes.get(page);
  if (existing) return existing;
  const created: FamilyRecipesRuntime = {
    visible: false,
    destroyed: false,
    listRequestToken: 0,
    editorOperationInFlight: false,
    pendingDraftId: null,
    retryOpenRecipeId: null,
    deferredFeedback: null,
  };
  pageRuntimes.set(page, created);
  return created;
};

const canUpdatePage = (runtime: FamilyRecipesRuntime): boolean =>
  runtime.visible && !runtime.destroyed;

const isFamilyRecipeTab = (value: unknown): value is FamilyRecipeTab =>
  typeof value === 'string' &&
  FAMILY_RECIPE_TABS.includes(value as FamilyRecipeTab);

const navigateToEditor = (id: number): Promise<void> =>
  new Promise((resolve, reject) => {
    wx.navigateTo({
      url: `/pages/recipe-editor/index?id=${String(id)}`,
      success: () => resolve(),
      fail: () => reject(new Error('RECIPE_EDITOR_NAVIGATION_FAILED')),
    });
  });

Page({
  data: {
    activeTab: 'PUBLISHED' as FamilyRecipeTab,
    loading: true,
    refreshing: false,
    creating: false,
    pendingDraftId: 0,
    items: [] as FamilyRecipeListItem[],
    errorMessage: '',
    errorSource: '' as FamilyRecipesErrorSource,
  },

  onLoad(query: { tab?: string }) {
    runtimeFor(this);
    this.setData({
      activeTab: isFamilyRecipeTab(query.tab) ? query.tab : 'PUBLISHED',
    });
  },

  async onShow() {
    const runtime = runtimeFor(this);
    if (runtime.destroyed) return;
    runtime.visible = true;

    if (runtime.pendingDraftId !== null) {
      this.setData({
        creating: runtime.editorOperationInFlight,
        pendingDraftId: runtime.pendingDraftId,
        errorMessage: '草稿已新建，可继续编辑',
        errorSource: 'OPEN_DRAFT',
      });
    } else if (runtime.deferredFeedback) {
      this.setData({
        creating: runtime.editorOperationInFlight,
        pendingDraftId: 0,
        errorMessage: runtime.deferredFeedback.message,
        errorSource: runtime.deferredFeedback.source,
      });
    } else {
      const clearsFinishedNavigation =
        this.data.errorSource === 'OPEN_DRAFT' &&
        runtime.retryOpenRecipeId === null;
      this.setData({
        creating: runtime.editorOperationInFlight,
        pendingDraftId: 0,
        ...(clearsFinishedNavigation
          ? {
              errorMessage: '',
              errorSource: '' as FamilyRecipesErrorSource,
            }
          : {}),
      });
    }

    await this.loadActiveTab();
  },

  onHide() {
    const runtime = runtimeFor(this);
    runtime.visible = false;
    runtime.listRequestToken += 1;
  },

  onUnload() {
    const runtime = runtimeFor(this);
    runtime.visible = false;
    runtime.destroyed = true;
    runtime.listRequestToken += 1;
    runtime.deferredFeedback = null;
  },

  async onRetry() {
    const runtime = runtimeFor(this);
    if (!canUpdatePage(runtime)) return;

    if (this.data.errorSource === 'CREATE') {
      await this.onCreateDraft();
      return;
    }
    if (this.data.errorSource === 'OPEN_DRAFT') {
      const id = runtime.retryOpenRecipeId ?? runtime.pendingDraftId;
      if (id !== null) {
        await this.openRecipeEditor(id, runtime.pendingDraftId === id);
      }
      return;
    }
    await this.loadActiveTab();
  },

  async onSelectTab(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab;
    if (!isFamilyRecipeTab(tab)) return;
    const runtime = runtimeFor(this);
    if (!canUpdatePage(runtime)) return;

    if (tab !== this.data.activeTab) {
      this.setData({
        activeTab: tab,
        loading: true,
        refreshing: false,
        items: [],
        ...(this.data.errorSource === 'LIST'
          ? {
              errorMessage: '',
              errorSource: '' as FamilyRecipesErrorSource,
            }
          : {}),
      });
    }
    await this.loadActiveTab();
  },

  async loadActiveTab() {
    const runtime = runtimeFor(this);
    if (!canUpdatePage(runtime)) return;

    const tab = this.data.activeTab;
    const token = ++runtime.listRequestToken;
    const hasRows = this.data.items.length > 0;
    const clearsListError = this.data.errorSource === 'LIST';
    this.setData({
      loading: !hasRows,
      refreshing: hasRows,
      ...(clearsListError
        ? {
            errorMessage: '',
            errorSource: '' as FamilyRecipesErrorSource,
          }
        : {}),
    });

    try {
      const items = await getApp<OsheeepApp>().listFamilyRecipes(tab);
      if (
        !canUpdatePage(runtime) ||
        token !== runtime.listRequestToken ||
        this.data.activeTab !== tab
      ) {
        return;
      }
      this.setData({
        items,
        ...(this.data.errorSource === 'LIST'
          ? {
              errorMessage: '',
              errorSource: '' as FamilyRecipesErrorSource,
            }
          : {}),
      });
    } catch {
      if (
        !canUpdatePage(runtime) ||
        token !== runtime.listRequestToken ||
        this.data.activeTab !== tab
      ) {
        return;
      }
      if (!this.data.errorSource || this.data.errorSource === 'LIST') {
        this.setData({
          errorMessage: '暂时加载失败，请稍后重试',
          errorSource: 'LIST',
        });
      }
    } finally {
      if (
        canUpdatePage(runtime) &&
        token === runtime.listRequestToken &&
        this.data.activeTab === tab
      ) {
        this.setData({ loading: false, refreshing: false });
      }
    }
  },

  async onCreateDraft() {
    const runtime = runtimeFor(this);
    if (!canUpdatePage(runtime) || runtime.editorOperationInFlight) return;

    if (runtime.pendingDraftId !== null) {
      await this.openRecipeEditor(runtime.pendingDraftId, true);
      return;
    }

    runtime.editorOperationInFlight = true;
    runtime.deferredFeedback = null;
    this.setData({
      creating: true,
      errorMessage: '',
      errorSource: '',
    });

    try {
      const created = await getApp<OsheeepApp>().createRecipeDraft();
      if (runtime.destroyed) {
        runtime.editorOperationInFlight = false;
        return;
      }

      runtime.pendingDraftId = created.id;
      runtime.retryOpenRecipeId = created.id;
      if (!runtime.visible) {
        runtime.editorOperationInFlight = false;
        runtime.deferredFeedback = {
          source: 'OPEN_DRAFT',
          message: '草稿已新建，可继续编辑',
        };
        return;
      }
      await this.finishEditorNavigation(created.id, true);
    } catch {
      runtime.editorOperationInFlight = false;
      if (runtime.destroyed) return;
      const feedback: DeferredFeedback = {
        source: 'CREATE',
        message: '新建菜谱失败，请稍后再试',
      };
      runtime.deferredFeedback = feedback;
      if (runtime.visible) {
        this.setData({
          creating: false,
          errorMessage: feedback.message,
          errorSource: feedback.source,
        });
      }
    }
  },

  async onOpenRecipe(event: WechatMiniprogram.TouchEvent) {
    const id = Number(event.currentTarget.dataset.id);
    if (!Number.isFinite(id) || id <= 0) return;
    await this.openRecipeEditor(id, false);
  },

  async openRecipeEditor(id: number, createdDraft: boolean) {
    const runtime = runtimeFor(this);
    if (!canUpdatePage(runtime) || runtime.editorOperationInFlight) return;

    runtime.editorOperationInFlight = true;
    runtime.retryOpenRecipeId = id;
    runtime.deferredFeedback = null;
    this.setData({
      creating: createdDraft,
      errorMessage: '',
      errorSource: '',
    });
    await this.finishEditorNavigation(id, createdDraft);
  },

  async finishEditorNavigation(id: number, createdDraft: boolean) {
    const runtime = runtimeFor(this);
    try {
      await navigateToEditor(id);
      if (runtime.pendingDraftId === id) runtime.pendingDraftId = null;
      if (runtime.retryOpenRecipeId === id) runtime.retryOpenRecipeId = null;
      runtime.deferredFeedback = null;
      runtime.editorOperationInFlight = false;
      if (canUpdatePage(runtime)) {
        this.setData({
          creating: false,
          pendingDraftId: 0,
          errorMessage: '',
          errorSource: '',
        });
      }
    } catch {
      runtime.editorOperationInFlight = false;
      runtime.retryOpenRecipeId = id;
      if (runtime.destroyed) return;

      const feedback: DeferredFeedback = {
        source: 'OPEN_DRAFT',
        message: createdDraft
          ? '草稿已新建，可继续编辑'
          : '暂时无法打开菜谱，请继续编辑',
      };
      runtime.deferredFeedback = feedback;
      if (runtime.visible) {
        this.setData({
          creating: false,
          pendingDraftId: runtime.pendingDraftId ?? 0,
          errorMessage: feedback.message,
          errorSource: feedback.source,
        });
      }
    }
  },
});
