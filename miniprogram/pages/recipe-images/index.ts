import type { RecipeImageAsset } from '../../types/recipe';

interface OsheeepApp {
  listRecipeImages: (query: string) => Promise<RecipeImageAsset[]>;
}

interface ImagePageData {
  loading: boolean;
  loadErrorMessage: string;
  searchQuery: string;
  assets: RecipeImageAsset[];
  visibleAssets: RecipeImageAsset[];
  selectedId: number;
  selectingId: number;
  interactionErrorMessage: string;
}

interface ImagePageContext {
  data: ImagePageData;
  setData(update: Partial<ImagePageData>, callback?: () => void): void;
  getOpenerEventChannel?: () =>
    WechatMiniprogram.EventChannel | WechatMiniprogram.EmptyEventChannel;
}

interface ImagePageRuntime {
  destroyed: boolean;
  requestToken: number;
  selectionEmitted: boolean;
  pendingSelectedId: number | null;
}

const pageRuntimes = new WeakMap<object, ImagePageRuntime>();

const runtimeFor = (page: object): ImagePageRuntime => {
  const existing = pageRuntimes.get(page);
  if (existing) return existing;
  const created: ImagePageRuntime = {
    destroyed: false,
    requestToken: 0,
    selectionEmitted: false,
    pendingSelectedId: null,
  };
  pageRuntimes.set(page, created);
  return created;
};

const visibleAssetsFor = (
  assets: RecipeImageAsset[],
  query: string,
): RecipeImageAsset[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return assets;
  return assets.filter(
    (asset) =>
      asset.displayName.toLocaleLowerCase().includes(normalized) ||
      asset.author.toLocaleLowerCase().includes(normalized),
  );
};

const loadImages = async (page: ImagePageContext): Promise<void> => {
  const runtime = runtimeFor(page);
  if (runtime.destroyed) return;
  const token = ++runtime.requestToken;
  page.setData({ loading: true, loadErrorMessage: '' });
  try {
    const assets = await getApp<OsheeepApp>().listRecipeImages('');
    if (runtime.destroyed || token !== runtime.requestToken) return;
    const approvedAssets = Array.isArray(assets) ? assets : [];
    page.setData({
      assets: approvedAssets,
      visibleAssets: visibleAssetsFor(approvedAssets, page.data.searchQuery),
      selectedId:
        visibleAssetsFor(approvedAssets, page.data.searchQuery)[0]?.id ?? 0,
      loadErrorMessage: '',
      interactionErrorMessage: '',
    });
  } catch {
    if (runtime.destroyed || token !== runtime.requestToken) return;
    page.setData({ loadErrorMessage: '暂时无法读取已审核图片，请稍后重试' });
  } finally {
    if (!runtime.destroyed && token === runtime.requestToken) {
      page.setData({ loading: false });
    }
  }
};

const navigateBack = (page: ImagePageContext): void => {
  const runtime = runtimeFor(page);
  if (runtime.destroyed || runtime.pendingSelectedId === null) return;
  const selectedId = runtime.pendingSelectedId;
  page.setData({ selectingId: selectedId, interactionErrorMessage: '' });
  wx.navigateBack({
    delta: 1,
    success: () => undefined,
    fail: () => {
      if (runtime.destroyed) return;
      page.setData({
        selectingId: 0,
        interactionErrorMessage: '图片已选择，返回失败，请再次点选返回',
      });
    },
  });
};

Page({
  data: {
    loading: true,
    loadErrorMessage: '',
    searchQuery: '',
    assets: [] as RecipeImageAsset[],
    visibleAssets: [] as RecipeImageAsset[],
    selectedId: 0,
    selectingId: 0,
    interactionErrorMessage: '',
  },

  async onLoad() {
    runtimeFor(this);
    await loadImages(this);
  },

  async onRetry() {
    await loadImages(this);
  },

  onUnload() {
    const runtime = runtimeFor(this);
    runtime.destroyed = true;
    runtime.requestToken += 1;
  },

  onSearchInput(event: WechatMiniprogram.Input) {
    const searchQuery = event.detail.value;
    const visibleAssets = visibleAssetsFor(this.data.assets, searchQuery);
    const selectedRemainsVisible = visibleAssets.some(
      (asset) => asset.id === this.data.selectedId,
    );
    this.setData({
      searchQuery,
      visibleAssets,
      selectedId: selectedRemainsVisible
        ? this.data.selectedId
        : (visibleAssets[0]?.id ?? 0),
    });
  },

  onMarkImage(event: WechatMiniprogram.TouchEvent) {
    const runtime = runtimeFor(this);
    if (runtime.destroyed || runtime.selectionEmitted) return;
    const id = Number(event.currentTarget.dataset.id);
    if (!this.data.visibleAssets.some((asset) => asset.id === id)) return;
    this.setData({ selectedId: id, interactionErrorMessage: '' });
  },

  onSelectImage(event: WechatMiniprogram.TouchEvent) {
    const runtime = runtimeFor(this);
    if (runtime.destroyed || this.data.selectingId !== 0) return;
    const id = Number(event.currentTarget.dataset.id);
    const selected = this.data.visibleAssets.find((asset) => asset.id === id);
    if (!selected) return;

    if (!runtime.selectionEmitted) {
      let eventChannel:
        | WechatMiniprogram.EventChannel
        | WechatMiniprogram.EmptyEventChannel
        | undefined;
      try {
        eventChannel = this.getOpenerEventChannel?.();
      } catch {
        eventChannel = undefined;
      }
      if (!eventChannel || typeof eventChannel.emit !== 'function') {
        this.setData({
          interactionErrorMessage: '暂时无法返回所选图片，请重试',
        });
        return;
      }
      eventChannel.emit('imageSelected', selected);
      runtime.selectionEmitted = true;
      runtime.pendingSelectedId = selected.id;
    }

    navigateBack(this);
  },

  onCopySource(event: WechatMiniprogram.TouchEvent) {
    const runtime = runtimeFor(this);
    if (runtime.destroyed) return;
    const id = Number(event.currentTarget.dataset.id);
    const asset = this.data.visibleAssets.find(
      (candidate) => candidate.id === id,
    );
    if (!asset) return;
    wx.setClipboardData({
      data: asset.sourcePageUrl,
      fail: () => {
        if (!runtime.destroyed) {
          this.setData({ interactionErrorMessage: '复制失败，请稍后重试' });
        }
      },
    });
  },
});
