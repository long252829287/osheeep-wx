import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  FamilyRecipeListItem,
  FamilyRecipeTab,
  RecipeDraft,
} from '../miniprogram/types/recipe';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

interface FamilyRecipesPageData {
  activeTab: FamilyRecipeTab;
  loading: boolean;
  refreshing: boolean;
  creating: boolean;
  pendingDraftId: number;
  items: FamilyRecipeListItem[];
  errorMessage: string;
  errorSource: '' | 'LIST' | 'CREATE' | 'OPEN_DRAFT';
}

interface TabEvent {
  currentTarget: { dataset: { tab?: string } };
}

interface RecipeEvent {
  currentTarget: { dataset: { id?: number | string } };
}

interface FamilyRecipesPageInstance {
  data: FamilyRecipesPageData;
  setData(update: Partial<FamilyRecipesPageData>): void;
  onLoad(query: { tab?: string }): void;
  onShow(): Promise<void>;
  onHide(): void;
  onUnload(): void;
  onRetry(): Promise<void>;
  onSelectTab(event: TabEvent): Promise<void>;
  onCreateDraft(): Promise<void>;
  onOpenRecipe(event: RecipeEvent): Promise<void>;
}

interface FamilyRecipesPageDefinition extends FamilyRecipesPageInstance {
  data: FamilyRecipesPageData;
}

interface AppMock {
  listFamilyRecipes: jest.Mock<
    Promise<FamilyRecipeListItem[]>,
    [FamilyRecipeTab]
  >;
  createRecipeDraft: jest.Mock<Promise<RecipeDraft>, []>;
}

interface NavigateToOptions {
  url: string;
  success?: () => void;
  fail?: () => void;
}

const runtime = globalThis as unknown as {
  Page?: (definition: FamilyRecipesPageDefinition) => void;
  getApp?: () => AppMock;
  wx?: { navigateTo: jest.Mock<void, [NavigateToOptions]> };
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;

const loadPage = async (): Promise<FamilyRecipesPageDefinition> => {
  const previousPage = runtime.Page;
  let captured: FamilyRecipesPageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };

  try {
    await jest.isolateModulesAsync(async () => {
      await import('../miniprogram/pages/family-recipes/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured) throw new Error('Family recipes Page was not captured');
  return captured;
};

const createPageInstance = (
  definition: FamilyRecipesPageDefinition,
): FamilyRecipesPageInstance => ({
  ...definition,
  data: {
    ...definition.data,
    items: [...definition.data.items],
  },
  setData(update: Partial<FamilyRecipesPageData>) {
    Object.assign(this.data, update);
  },
});

const listItem = (
  id: number,
  status: FamilyRecipeListItem['status'],
): FamilyRecipeListItem => ({
  id,
  status,
  name: status === 'DRAFT' ? null : `菜谱 ${id}`,
  imageUrl: null,
  category: '家常菜',
  flavor: '咸鲜',
  servings: 2,
  estimatedMinutes: 15,
  version: 1,
  creatorId: 7,
  creatorName: '小林',
  lastModifiedBy: 8,
  lastModifiedByName: '阿禾',
  completedStep: status === 'DRAFT' ? 'INGREDIENTS' : 'PREVIEW',
  updatedAt: '2026-07-20T08:00:00Z',
});

const draft = (id: number): RecipeDraft => ({
  id,
  status: 'DRAFT',
  version: 0,
  name: null,
  category: null,
  flavor: null,
  servings: null,
  estimatedMinutes: null,
  ingredients: [],
  defaultMethod: null,
  image: null,
  incompleteSteps: ['BASIC', 'INGREDIENTS', 'METHOD', 'IMAGE', 'PREVIEW'],
  updatedAt: null,
});

const createAppMock = (): AppMock => ({
  listFamilyRecipes: jest
    .fn<Promise<FamilyRecipeListItem[]>, [FamilyRecipeTab]>()
    .mockResolvedValue([]),
  createRecipeDraft: jest
    .fn<Promise<RecipeDraft>, []>()
    .mockResolvedValue(draft(1)),
});

const deferred = <T>() => {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value);
    },
    reject(reason: unknown) {
      rejectPromise?.(reason);
    },
  };
};

const tabEvent = (tab: string): TabEvent => ({
  currentTarget: { dataset: { tab } },
});

const recipeEvent = (id: number | string): RecipeEvent => ({
  currentTarget: { dataset: { id } },
});

beforeEach(() => {
  runtime.wx = {
    navigateTo: jest.fn<void, [NavigateToOptions]>((options) => {
      options.success?.();
    }),
  };
});

afterEach(() => {
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('renders native navigation, tabs, explicit empty states and restrained actions', () => {
  const config = readProjectFile('miniprogram/pages/family-recipes/index.json');
  const wxml = readProjectFile('miniprogram/pages/family-recipes/index.wxml');
  const wxss = readProjectFile('miniprogram/pages/family-recipes/index.wxss');

  expect(config).toContain('"navigationBarTitleText": "家庭菜谱"');
  expect(config).toContain('"navigationBarBackgroundColor": "#FFFAF3"');
  expect(wxml).toContain('已发布');
  expect(wxml).toContain('我的草稿');
  expect(wxml).toContain('已归档');
  expect(wxml).toContain('新建菜谱');
  expect(wxml).toContain('还没有家庭菜谱，先从一道家常菜开始');
  expect(wxml).toContain('没有未完成的草稿');
  expect(wxml).toContain('归档后的菜谱会留在这里');
  expect(wxml).toContain('bindtap="onRetry"');
  expect(wxml).toContain('bindtap="onCreateDraft"');
  expect(wxml).toContain('bindtap="onSelectTab"');
  expect(wxml).toContain('bindtap="onOpenRecipe"');
  expect(wxml).toContain("item.name || '未命名菜谱'");
  expect(wxml).toContain('item.imageUrl');
  expect(wxml).toContain('创建');
  expect(wxml).toContain('修改');
  expect(wxml).toContain('编辑进度');
  expect(wxml).toContain('已归档菜谱');
  expect(wxml).toContain('aria-role="tablist"');
  expect(wxml).toContain('aria-role="tab"');
  expect(wxml).toContain('aria-role="alert"');
  expect(wxml).toContain('aria-live="polite"');
  expect(wxml).not.toMatch(/\srole="/);
  expect(wxml).toContain("errorSource === 'CREATE' ? '重试新建'");
  expect(wxml).toContain("errorSource === 'OPEN_DRAFT' ? '继续编辑'");
  expect(wxml).toContain('item.servings && item.estimatedMinutes');
  expect(wxml).not.toContain('> · {{item.estimatedMinutes}} 分钟</text>');
  expect(wxml).not.toContain('<bottom-nav');
  expect(wxml).not.toContain('navigation-back');
  expect(wxss).toMatch(/\.page-shell\s*\{[^}]*padding:[^;]*38rpx/s);
  for (const className of [
    'tab-button',
    'create-button',
    'retry-button',
    'recipe-row',
  ]) {
    expect(wxss).toMatch(
      new RegExp(`\\.${className}\\s*\\{[^}]*min-height:\\s*88rpx;`, 's'),
    );
  }
  expect(wxss).toMatch(
    /\.recipe-row\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*100%;[^}]*justify-content:\s*flex-start;/s,
  );
  expect(wxss).not.toMatch(/[^@]\[[^\]]+\]\s*\{/);
  expect(wxss).not.toMatch(/\.recipe-row--archived\s*\{[^}]*opacity:/s);
  expect(wxss).toMatch(
    /\.recipe-row--archived \.recipe-image,[^}]*\.recipe-row--archived \.recipe-name[^}]*\{[^}]*opacity:/s,
  );

  const colors = [...wxss.matchAll(/#[0-9a-fA-F]{6}/g)].map(([color]) =>
    color.toUpperCase(),
  );
  expect(new Set(colors)).toEqual(
    new Set(['#FFFAF3', '#CA5325', '#7B823B', '#282722']),
  );
});

test('starts with the exact published-list state', async () => {
  const page = createPageInstance(await loadPage());

  expect(page.data).toEqual({
    activeTab: 'PUBLISHED',
    loading: true,
    refreshing: false,
    creating: false,
    pendingDraftId: 0,
    items: [],
    errorMessage: '',
    errorSource: '',
  });
});

test('accepts only a valid initial tab from the redirect query', async () => {
  const page = createPageInstance(await loadPage());

  page.onLoad({ tab: 'ARCHIVED' });
  expect(page.data.activeTab).toBe('ARCHIVED');
  page.onLoad({ tab: 'UNKNOWN' });
  expect(page.data.activeTab).toBe('PUBLISHED');
  page.onLoad({});
  expect(page.data.activeTab).toBe('PUBLISHED');
});

test('loads the selected tab and ignores stale tab responses', async () => {
  const published = deferred<FamilyRecipeListItem[]>();
  const drafts = deferred<FamilyRecipeListItem[]>();
  const app = createAppMock();
  app.listFamilyRecipes
    .mockReturnValueOnce(published.promise)
    .mockReturnValueOnce(drafts.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());

  const first = page.onShow();
  const second = page.onSelectTab(tabEvent('DRAFT'));
  expect(app.listFamilyRecipes).toHaveBeenNthCalledWith(1, 'PUBLISHED');
  expect(app.listFamilyRecipes).toHaveBeenNthCalledWith(2, 'DRAFT');

  drafts.resolve([listItem(2, 'DRAFT')]);
  await second;
  published.resolve([listItem(1, 'PUBLISHED')]);
  await first;

  expect(page.data.activeTab).toBe('DRAFT');
  expect(page.data.items.map((item) => item.id)).toEqual([2]);
  expect(page.data.loading).toBe(false);
  expect(page.data.refreshing).toBe(false);
});

test('ignores invalid tab controls without issuing a request', async () => {
  const app = createAppMock();
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());

  await page.onSelectTab(tabEvent('UNKNOWN'));

  expect(page.data.activeTab).toBe('PUBLISHED');
  expect(app.listFamilyRecipes).not.toHaveBeenCalled();
});

test('keeps existing rows during a failed refresh and retries the active tab', async () => {
  const app = createAppMock();
  app.listFamilyRecipes
    .mockResolvedValueOnce([listItem(4, 'PUBLISHED')])
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce([listItem(5, 'PUBLISHED')]);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());
  await page.onShow();

  await page.onShow();
  expect(page.data.items.map((item) => item.id)).toEqual([4]);
  expect(page.data.errorMessage).not.toBe('');
  expect(page.data.errorSource).toBe('LIST');
  expect(page.data.loading).toBe(false);
  expect(page.data.refreshing).toBe(false);

  await page.onRetry();
  expect(app.listFamilyRecipes).toHaveBeenLastCalledWith('PUBLISHED');
  expect(page.data.items.map((item) => item.id)).toEqual([5]);
  expect(page.data.errorMessage).toBe('');
  expect(page.data.errorSource).toBe('');
});

test('creates a draft once and opens its editor', async () => {
  const created = deferred<RecipeDraft>();
  const app = createAppMock();
  app.createRecipeDraft.mockReturnValue(created.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());
  await page.onShow();

  const first = page.onCreateDraft();
  const duplicate = page.onCreateDraft();
  expect(page.data.creating).toBe(true);
  expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);

  created.resolve(draft(9));
  await Promise.all([first, duplicate]);

  expect(runtime.wx?.navigateTo).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/pages/recipe-editor/index?id=9' }),
  );
  expect(page.data.creating).toBe(false);
});

test('keeps the list after create failure and lets the create action retry', async () => {
  const app = createAppMock();
  app.createRecipeDraft
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(draft(11));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());
  await page.onShow();
  page.setData({ items: [listItem(3, 'PUBLISHED')] });

  await page.onCreateDraft();
  expect(page.data.items.map((item) => item.id)).toEqual([3]);
  expect(page.data.errorMessage).not.toBe('');
  expect(page.data.errorSource).toBe('CREATE');
  expect(page.data.creating).toBe(false);

  await page.onRetry();
  expect(app.createRecipeDraft).toHaveBeenCalledTimes(2);
  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/pages/recipe-editor/index?id=11' }),
  );
  expect(page.data.errorMessage).toBe('');
  expect(page.data.errorSource).toBe('');
});

test('opens only recipes with a valid positive id', async () => {
  const app = createAppMock();
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());
  await page.onShow();

  await page.onOpenRecipe(recipeEvent(12));
  await page.onOpenRecipe(recipeEvent('bad'));
  await page.onOpenRecipe(recipeEvent(0));

  expect(runtime.wx?.navigateTo).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/pages/recipe-editor/index?id=12' }),
  );
});

test('isolates list request tokens between page instances', async () => {
  const firstRequest = deferred<FamilyRecipeListItem[]>();
  const secondRequest = deferred<FamilyRecipeListItem[]>();
  const app = createAppMock();
  app.listFamilyRecipes
    .mockReturnValueOnce(firstRequest.promise)
    .mockReturnValueOnce(secondRequest.promise);
  runtime.getApp = () => app;
  const definition = await loadPage();
  const firstPage = createPageInstance(definition);
  const secondPage = createPageInstance(definition);

  const firstLoad = firstPage.onShow();
  const secondLoad = secondPage.onShow();
  firstRequest.resolve([listItem(21, 'PUBLISHED')]);
  await firstLoad;
  secondRequest.resolve([listItem(22, 'PUBLISHED')]);
  await secondLoad;

  expect(firstPage.data.items.map((item) => item.id)).toEqual([21]);
  expect(secondPage.data.items.map((item) => item.id)).toEqual([22]);
});

test('keeps the newest same-tab onShow response', async () => {
  const older = deferred<FamilyRecipeListItem[]>();
  const newer = deferred<FamilyRecipeListItem[]>();
  const app = createAppMock();
  app.listFamilyRecipes
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());

  const first = page.onShow();
  const second = page.onShow();
  newer.resolve([listItem(32, 'PUBLISHED')]);
  await second;
  older.resolve([listItem(31, 'PUBLISHED')]);
  await first;

  expect(page.data.items.map((item) => item.id)).toEqual([32]);
});

test.each([
  { lifecycle: 'hide', settlement: 'resolve' },
  { lifecycle: 'hide', settlement: 'reject' },
  { lifecycle: 'unload', settlement: 'resolve' },
  { lifecycle: 'unload', settlement: 'reject' },
] as const)(
  'does not update a page when list requests $settlement after $lifecycle',
  async ({ lifecycle, settlement }) => {
    const request = deferred<FamilyRecipeListItem[]>();
    const app = createAppMock();
    app.listFamilyRecipes.mockReturnValue(request.promise);
    runtime.getApp = () => app;
    const page = createPageInstance(await loadPage());
    const setData = jest.spyOn(page, 'setData');

    const loading = page.onShow();
    if (lifecycle === 'hide') page.onHide();
    else page.onUnload();
    const callsAtLifecycle = setData.mock.calls.length;

    if (settlement === 'resolve') {
      request.resolve([listItem(41, 'PUBLISHED')]);
    } else {
      request.reject(new Error('offline'));
    }
    await loading;

    expect(setData).toHaveBeenCalledTimes(callsAtLifecycle);
    expect(page.data.items).toEqual([]);
  },
);

test('does not navigate when create resolves while hidden and resumes the same draft', async () => {
  const created = deferred<RecipeDraft>();
  const app = createAppMock();
  app.createRecipeDraft.mockReturnValue(created.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());
  await page.onShow();
  const setData = jest.spyOn(page, 'setData');

  const creating = page.onCreateDraft();
  page.onHide();
  const callsAtHide = setData.mock.calls.length;
  created.resolve(draft(51));
  await creating;

  expect(runtime.wx?.navigateTo).not.toHaveBeenCalled();
  expect(setData).toHaveBeenCalledTimes(callsAtHide);
  expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);

  await page.onShow();
  expect(page.data.pendingDraftId).toBe(51);
  expect(page.data.errorSource).toBe('OPEN_DRAFT');
  expect(page.data.errorMessage).toBe('草稿已新建，可继续编辑');
  expect(page.data.creating).toBe(false);

  await page.onCreateDraft();
  expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/pages/recipe-editor/index?id=51' }),
  );
});

test.each(['retry', 'create'] as const)(
  'does not auto-navigate a create that crosses hide and show, then resumes it via %s',
  async (resumeAction) => {
    const created = deferred<RecipeDraft>();
    const app = createAppMock();
    app.createRecipeDraft.mockReturnValue(created.promise);
    runtime.getApp = () => app;
    const page = createPageInstance(await loadPage());
    await page.onShow();

    const creating = page.onCreateDraft();
    page.onHide();
    await page.onShow();
    created.resolve(draft(56));
    await creating;

    expect(runtime.wx?.navigateTo).not.toHaveBeenCalled();
    expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);
    expect(page.data.pendingDraftId).toBe(56);
    expect(page.data.errorSource).toBe('OPEN_DRAFT');
    expect(page.data.errorMessage).toBe('草稿已新建，可继续编辑');

    if (resumeAction === 'retry') await page.onRetry();
    else await page.onCreateDraft();

    expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);
    expect(runtime.wx?.navigateTo).toHaveBeenCalledTimes(1);
    expect(runtime.wx?.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/recipe-editor/index?id=56' }),
    );
  },
);

test('does not invalidate an in-flight create when onShow repeats while already visible', async () => {
  const created = deferred<RecipeDraft>();
  const app = createAppMock();
  app.createRecipeDraft.mockReturnValue(created.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());
  await page.onShow();

  const creating = page.onCreateDraft();
  await page.onShow();
  created.resolve(draft(57));
  await creating;

  expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.navigateTo).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/pages/recipe-editor/index?id=57' }),
  );
});

test('does not update or navigate when create resolves after unload', async () => {
  const created = deferred<RecipeDraft>();
  const app = createAppMock();
  app.createRecipeDraft.mockReturnValue(created.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadPage());
  await page.onShow();
  const setData = jest.spyOn(page, 'setData');

  const creating = page.onCreateDraft();
  page.onUnload();
  const callsAtUnload = setData.mock.calls.length;
  created.resolve(draft(61));
  await creating;

  expect(runtime.wx?.navigateTo).not.toHaveBeenCalled();
  expect(setData).toHaveBeenCalledTimes(callsAtUnload);
});

test('holds the duplicate guard through navigation and retries the created id without creating twice', async () => {
  const app = createAppMock();
  app.createRecipeDraft.mockResolvedValue(draft(71));
  runtime.getApp = () => app;
  runtime.wx = {
    navigateTo: jest.fn<void, [NavigateToOptions]>(),
  };
  const page = createPageInstance(await loadPage());
  await page.onShow();

  const first = page.onCreateDraft();
  await Promise.resolve();
  await Promise.resolve();
  expect(runtime.wx.navigateTo).toHaveBeenCalledTimes(1);
  expect(page.data.creating).toBe(true);

  const duplicate = page.onCreateDraft();
  expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);
  runtime.wx.navigateTo.mock.calls[0][0].fail?.();
  await Promise.all([first, duplicate]);

  expect(page.data.creating).toBe(false);
  expect(page.data.pendingDraftId).toBe(71);
  expect(page.data.errorSource).toBe('OPEN_DRAFT');
  expect(page.data.errorMessage).toBe('草稿已新建，可继续编辑');

  const retry = page.onRetry();
  await Promise.resolve();
  expect(app.createRecipeDraft).toHaveBeenCalledTimes(1);
  expect(runtime.wx.navigateTo).toHaveBeenCalledTimes(2);
  expect(runtime.wx.navigateTo.mock.calls[1][0].url).toBe(
    '/pages/recipe-editor/index?id=71',
  );
  runtime.wx.navigateTo.mock.calls[1][0].success?.();
  await retry;

  expect(page.data.pendingDraftId).toBe(0);
  expect(page.data.errorSource).toBe('');
});

test('retries a failed existing-recipe navigation without creating a draft', async () => {
  const app = createAppMock();
  runtime.getApp = () => app;
  runtime.wx = {
    navigateTo: jest.fn<void, [NavigateToOptions]>(),
  };
  const page = createPageInstance(await loadPage());
  await page.onShow();

  const opening = page.onOpenRecipe(recipeEvent(81));
  await Promise.resolve();
  runtime.wx.navigateTo.mock.calls[0][0].fail?.();
  await opening;

  expect(page.data.errorSource).toBe('OPEN_DRAFT');
  expect(app.createRecipeDraft).not.toHaveBeenCalled();

  const retry = page.onRetry();
  await Promise.resolve();
  expect(runtime.wx.navigateTo.mock.calls[1][0].url).toBe(
    '/pages/recipe-editor/index?id=81',
  );
  runtime.wx.navigateTo.mock.calls[1][0].success?.();
  await retry;
  expect(app.createRecipeDraft).not.toHaveBeenCalled();
});

test.each(['hide', 'unload'] as const)(
  'does not set data when a navigation callback settles after %s',
  async (lifecycle) => {
    const app = createAppMock();
    runtime.getApp = () => app;
    runtime.wx = {
      navigateTo: jest.fn<void, [NavigateToOptions]>(),
    };
    const page = createPageInstance(await loadPage());
    await page.onShow();
    const setData = jest.spyOn(page, 'setData');

    const opening = page.onOpenRecipe(recipeEvent(91));
    await Promise.resolve();
    if (lifecycle === 'hide') page.onHide();
    else page.onUnload();
    const callsAtLifecycle = setData.mock.calls.length;
    runtime.wx.navigateTo.mock.calls[0][0].fail?.();
    await opening;

    expect(setData).toHaveBeenCalledTimes(callsAtLifecycle);
    if (lifecycle === 'hide') {
      await page.onShow();
      expect(page.data.errorSource).toBe('OPEN_DRAFT');
      expect(page.data.errorMessage).toBe('暂时无法打开菜谱，请继续编辑');
    }
  },
);
