import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from '../miniprogram/services/request';
import type { HouseholdSummary } from '../miniprogram/types/household';
import type {
  CompleteMenuResult,
  MenuDish,
  TodayMenu,
} from '../miniprogram/types/menu';
import type { toMenuDishPresentation } from '../miniprogram/utils/menu-state';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

type DishView = ReturnType<typeof toMenuDishPresentation>;

interface TonightPageData {
  loading: boolean;
  household: HouseholdSummary | null;
  menu: TodayMenu | null;
  dishes: DishView[];
  errorMessage: string;
  noticeMessage: string;
  actionPending: boolean;
}

interface TonightPageInstance {
  data: TonightPageData;
  setData(update: Partial<TonightPageData>): void;
  onShow(): void;
  onHide(): void;
  onUnload(): void;
  loadMenu(): Promise<void>;
  onChooseRecipes(): void;
  onConfirmMenu(): Promise<void>;
  onCompleteMenu(): Promise<void>;
  handleActionError(error: unknown): void;
  onOpenRecord(): void;
}

interface TonightPageDefinition extends TonightPageInstance {
  data: TonightPageData;
}

interface AppMock {
  getHousehold: jest.Mock<Promise<HouseholdSummary | null>, []>;
  getTodayMenu: jest.Mock<Promise<TodayMenu>, []>;
  confirmTodayMenu: jest.Mock<Promise<TodayMenu>, [number, string]>;
  completeTodayMenu: jest.Mock<Promise<CompleteMenuResult>, [number, string]>;
}

const runtime = globalThis as unknown as {
  Page?: (definition: TonightPageDefinition) => void;
  getApp?: () => AppMock;
  wx?: {
    getRandomValues: jest.Mock;
    navigateTo: jest.Mock;
    reLaunch: jest.Mock;
  };
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;
let createPageApiError = (errorCode: string, message: string) =>
  new ApiError(errorCode, message);

const loadTonightPage = async (): Promise<TonightPageDefinition> => {
  const previousPage = runtime.Page;
  let captured: TonightPageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };

  try {
    await jest.isolateModulesAsync(async () => {
      const { ApiError: PageApiError } =
        await import('../miniprogram/services/request');
      createPageApiError = (errorCode, message) =>
        new PageApiError(errorCode, message);
      await import('../miniprogram/pages/tonight/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured) throw new Error('Tonight Page definition was not captured');
  return captured;
};

const createInstance = (
  definition: TonightPageDefinition,
): TonightPageInstance => ({
  ...definition,
  data: {
    ...definition.data,
    dishes: [...definition.data.dishes],
  },
  setData(update: Partial<TonightPageData>) {
    Object.assign(this.data, update);
  },
});

const household: HouseholdSummary = {
  id: 11,
  name: '我们的小家',
  timezone: 'Asia/Shanghai',
  memberCount: 2,
};

const dish = (overrides: Partial<MenuDish> = {}): MenuDish => ({
  recipeId: 14,
  name: '番茄炒蛋',
  imagePath: 'https://www.osheeep.com/media/recipes/tomato-list.webp',
  category: '家常菜',
  flavor: '酸甜',
  estimatedMinutes: 15,
  scope: 'HOUSEHOLD',
  recipeVersion: 8,
  method: { id: 21, name: '家常做法', cookingStyle: '炒' },
  source: 'BOTH',
  ...overrides,
});

const menu = (
  status: TodayMenu['status'] = 'DRAFT',
  version = 4,
  dishes: MenuDish[] = [dish()],
  overrides: Partial<TodayMenu> = {},
): TodayMenu => ({
  id: 31,
  menuDate: '2026-07-21',
  status,
  version,
  mySelectionCount: dishes.length,
  partnerSelectionCount: dishes.filter((item) => item.source !== 'ME').length,
  consensusCount: dishes.filter((item) => item.source === 'BOTH').length,
  selectedRecipeIds: dishes.map((item) => item.recipeId),
  dishes,
  ...overrides,
});

const createAppMock = (): AppMock => ({
  getHousehold: jest
    .fn<Promise<HouseholdSummary | null>, []>()
    .mockResolvedValue(household),
  getTodayMenu: jest.fn<Promise<TodayMenu>, []>().mockResolvedValue(menu()),
  confirmTodayMenu: jest
    .fn<Promise<TodayMenu>, [number, string]>()
    .mockResolvedValue(menu('CONFIRMED', 5)),
  completeTodayMenu: jest
    .fn<Promise<CompleteMenuResult>, [number, string]>()
    .mockResolvedValue({
      recordId: 91,
      menu: menu('COMPLETED', 6, [dish()], { recordId: 91 }),
    }),
});

const deferred = <T>() => {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value);
    },
  };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  runtime.wx = {
    getRandomValues: jest.fn(({ length, success }) => {
      success?.({
        randomValues: Uint8Array.from({ length }, (_value, index) => index)
          .buffer,
        errMsg: 'getRandomValues:ok',
      });
    }),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('renders household context with existing source semantics and safe actions', () => {
  const wxml = readProjectFile('miniprogram/pages/tonight/index.wxml');
  const wxss = readProjectFile('miniprogram/pages/tonight/index.wxss');

  expect(wxml).toContain('今晚吃什么');
  expect(wxml).toContain('wx:if="{{item.contextLabel}}"');
  expect(wxml).toContain('{{item.contextLabel}}');
  expect(wxml).toContain('dish-card--{{item.sourceTone}}');
  expect(wxml).toContain('{{item.sourceLabel}}');
  expect(wxml).not.toContain('未知做法');
  expect(wxml).toContain("'primary-button--disabled'");
  expect(wxss).toMatch(/\.dish-context\s*\{/);
  expect(wxss).toContain('env(safe-area-inset-bottom)');
  expect(wxss).toMatch(
    /\.tonight-page\s*\{[^}]*width:\s*100%;[^}]*overflow-x:\s*hidden;/s,
  );
  expect(wxss).not.toContain('.primary-button[disabled]');
  expect(wxss).toMatch(/\.primary-button--disabled\s*\{/);
  expect(wxss).toMatch(/\.secondary-button\s*\{[^}]*min-height:\s*88rpx;/s);
  expect(wxss).toMatch(/\.dish-copy\s*\{[^}]*width:\s*0;[^}]*flex:\s*1 1 0%;/s);
  expect(wxss).toMatch(
    /\.dish-context\s*\{[^}]*min-width:\s*0;[^}]*white-space:\s*normal;[^}]*word-break:\s*break-all;/s,
  );
  expect(wxss).toMatch(/\.source-label\s*\{[^}]*flex:\s*0 0 auto;/s);
});

test('prepares household and system menu rows without changing order or BOTH source', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const familyDish = dish();
  const systemDish = dish({
    recipeId: 1,
    name: '素炒时蔬',
    scope: 'SYSTEM',
    recipeVersion: 1,
    method: null,
    source: 'ME',
  });
  const app = createAppMock();
  app.getTodayMenu.mockResolvedValue(
    menu('DRAFT', 4, [familyDish, systemDish]),
  );
  runtime.getApp = () => app;

  await definition.loadMenu.call(instance);

  expect(instance.data.dishes.map((item) => item.recipeId)).toEqual([14, 1]);
  expect(instance.data.dishes[0]).toMatchObject({
    contextLabel: '自家菜谱 · 家常做法',
    sourceLabel: '都想吃',
    sourceTone: 'both',
  });
  expect(instance.data.dishes[1]).toMatchObject({
    contextLabel: '',
    sourceLabel: '我想吃',
    sourceTone: 'mine',
  });
});

test('keeps a maximum-length household method context intact', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const maximumMethodName = '慢'.repeat(40);
  const app = createAppMock();
  app.getTodayMenu.mockResolvedValue(
    menu('DRAFT', 4, [
      dish({
        method: {
          id: 21,
          name: maximumMethodName,
          cookingStyle: '炒',
        },
      }),
    ]),
  );
  runtime.getApp = () => app;

  await definition.loadMenu.call(instance);

  expect(instance.data.dishes[0].contextLabel).toBe(
    `自家菜谱 · ${maximumMethodName}`,
  );
});

test('polls immediately every eight seconds and stops when hidden', async () => {
  jest.useFakeTimers();
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const app = createAppMock();
  runtime.getApp = () => app;

  definition.onShow.call(instance);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(1);

  jest.advanceTimersByTime(8000);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(2);

  definition.onHide.call(instance);
  jest.advanceTimersByTime(8000);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(2);
  await flushPromises();
});

test('stops polling when the page unloads', async () => {
  jest.useFakeTimers();
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const app = createAppMock();
  runtime.getApp = () => app;

  definition.onShow.call(instance);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(1);

  definition.onUnload.call(instance);
  jest.advanceTimersByTime(8000);

  expect(app.getTodayMenu).toHaveBeenCalledTimes(1);
  await flushPromises();
});

test('confirms the current menu with one UUID action and refreshes its rows', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const confirmed = menu('CONFIRMED', 5);
  const app = createAppMock();
  app.confirmTodayMenu.mockResolvedValue(confirmed);
  runtime.getApp = () => app;
  await definition.loadMenu.call(instance);

  await definition.onConfirmMenu.call(instance);

  expect(app.confirmTodayMenu).toHaveBeenCalledWith(
    4,
    '00010203-0405-4607-8809-0a0b0c0d0e0f',
  );
  expect(instance.data.menu).toEqual(confirmed);
  expect(instance.data.dishes[0].contextLabel).toBe('自家菜谱 · 家常做法');
  expect(instance.data.actionPending).toBe(false);
});

test('completes once and opens the immutable record detail', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const confirmed = menu('CONFIRMED', 5);
  const completed = menu('COMPLETED', 6, [dish()], { recordId: 91 });
  const app = createAppMock();
  app.getTodayMenu.mockResolvedValue(confirmed);
  app.completeTodayMenu.mockResolvedValue({ recordId: 91, menu: completed });
  runtime.getApp = () => app;
  await definition.loadMenu.call(instance);

  await definition.onCompleteMenu.call(instance);

  expect(app.completeTodayMenu).toHaveBeenCalledWith(
    5,
    '00010203-0405-4607-8809-0a0b0c0d0e0f',
  );
  expect(instance.data.menu).toEqual(completed);
  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith({
    url: '/pages/record-detail/index?id=91',
  });
  expect(instance.data.actionPending).toBe(false);
});

test('reloads the latest menu after a version conflict without replaying confirm', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const latestRequest = deferred<TodayMenu>();
  const latest = menu('DRAFT', 7, [dish({ recipeId: 20 })]);
  const app = createAppMock();
  app.getTodayMenu
    .mockResolvedValueOnce(menu('DRAFT', 4))
    .mockReturnValueOnce(latestRequest.promise);
  app.confirmTodayMenu.mockRejectedValueOnce(
    createPageApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已更新'),
  );
  runtime.getApp = () => app;
  await definition.loadMenu.call(instance);

  await definition.onConfirmMenu.call(instance);

  expect(app.confirmTodayMenu).toHaveBeenCalledTimes(1);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(2);
  expect(instance.data.noticeMessage).toBe(
    '菜单已被对方更新，请确认最新内容后重新保存',
  );

  latestRequest.resolve(latest);
  await flushPromises();

  expect(instance.data.menu).toEqual(latest);
  expect(instance.data.dishes.map((item) => item.recipeId)).toEqual([20]);
  expect(app.confirmTodayMenu).toHaveBeenCalledTimes(1);
  expect(instance.data.noticeMessage).toBe(
    '菜单已被对方更新，请确认最新内容后重新保存',
  );
});

test('keeps the conflict notice when an in-flight ordinary refresh finishes later', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const ordinaryRefresh = deferred<TodayMenu>();
  const latest = menu('DRAFT', 7, [dish({ recipeId: 20 })]);
  const app = createAppMock();
  app.getTodayMenu
    .mockResolvedValueOnce(menu('DRAFT', 4))
    .mockReturnValueOnce(ordinaryRefresh.promise)
    .mockResolvedValueOnce(latest);
  app.confirmTodayMenu.mockRejectedValueOnce(
    createPageApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已更新'),
  );
  runtime.getApp = () => app;
  await definition.loadMenu.call(instance);

  const pollingLoad = definition.loadMenu.call(instance);
  await definition.onConfirmMenu.call(instance);
  await flushPromises();

  expect(instance.data.noticeMessage).toBe(
    '菜单已被对方更新，请确认最新内容后重新保存',
  );

  ordinaryRefresh.resolve(latest);
  await pollingLoad;

  expect(instance.data.noticeMessage).toBe(
    '菜单已被对方更新，请确认最新内容后重新保存',
  );
  expect(app.confirmTodayMenu).toHaveBeenCalledTimes(1);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(3);
  expect(runtime.wx?.navigateTo).not.toHaveBeenCalled();
});

test('keeps the conflict notice after a fast complete refresh without replay or navigation', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const confirmed = menu('CONFIRMED', 5);
  const latest = menu('CONFIRMED', 7, [dish({ recipeId: 20 })]);
  const app = createAppMock();
  app.getTodayMenu
    .mockResolvedValueOnce(confirmed)
    .mockResolvedValueOnce(latest);
  app.completeTodayMenu.mockRejectedValueOnce(
    createPageApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已更新'),
  );
  runtime.getApp = () => app;
  await definition.loadMenu.call(instance);

  await definition.onCompleteMenu.call(instance);
  await flushPromises();

  expect(app.completeTodayMenu).toHaveBeenCalledTimes(1);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(2);
  expect(instance.data.menu).toEqual(latest);
  expect(instance.data.noticeMessage).toBe(
    '菜单已被对方更新，请确认最新内容后重新保存',
  );
  expect(runtime.wx?.navigateTo).not.toHaveBeenCalled();
});

test('shows the refresh failure when conflict recovery cannot load the latest menu', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getTodayMenu
    .mockResolvedValueOnce(menu('DRAFT', 4))
    .mockRejectedValueOnce(new Error('offline'));
  app.confirmTodayMenu.mockRejectedValueOnce(
    createPageApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已更新'),
  );
  runtime.getApp = () => app;
  await definition.loadMenu.call(instance);

  await definition.onConfirmMenu.call(instance);
  await flushPromises();

  expect(app.confirmTodayMenu).toHaveBeenCalledTimes(1);
  expect(instance.data.menu?.version).toBe(4);
  expect(instance.data.noticeMessage).toBe('菜单加载失败，请稍后重试');
});

test('clears a transient load failure on the next successful ordinary refresh', async () => {
  const definition = await loadTonightPage();
  const instance = createInstance(definition);
  const latest = menu('DRAFT', 5, [dish({ recipeId: 20 })]);
  const app = createAppMock();
  app.getTodayMenu
    .mockResolvedValueOnce(menu('DRAFT', 4))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(latest);
  runtime.getApp = () => app;
  await definition.loadMenu.call(instance);

  await definition.loadMenu.call(instance);
  expect(instance.data.noticeMessage).toBe('菜单加载失败，请稍后重试');

  await definition.loadMenu.call(instance);

  expect(instance.data.menu).toEqual(latest);
  expect(instance.data.noticeMessage).toBe('');
});

test.each(['confirm', 'complete'] as const)(
  'clears the sticky conflict notice when the user retries %s',
  async (action) => {
    const definition = await loadTonightPage();
    const instance = createInstance(definition);
    const latest = menu(action === 'confirm' ? 'DRAFT' : 'CONFIRMED', 7);
    const app = createAppMock();
    app.getTodayMenu
      .mockResolvedValueOnce(
        menu(action === 'confirm' ? 'DRAFT' : 'CONFIRMED', 4),
      )
      .mockResolvedValueOnce(latest)
      .mockResolvedValueOnce(latest);
    const actionMock =
      action === 'confirm' ? app.confirmTodayMenu : app.completeTodayMenu;
    actionMock
      .mockRejectedValueOnce(
        createPageApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已更新'),
      )
      .mockRejectedValueOnce(new Error('offline'));
    runtime.getApp = () => app;
    await definition.loadMenu.call(instance);
    const invokeAction = () =>
      action === 'confirm'
        ? definition.onConfirmMenu.call(instance)
        : definition.onCompleteMenu.call(instance);

    await invokeAction();
    await flushPromises();
    expect(instance.data.noticeMessage).toBe(
      '菜单已被对方更新，请确认最新内容后重新保存',
    );

    await invokeAction();
    expect(instance.data.noticeMessage).toBe('操作失败，请稍后重试');

    await definition.loadMenu.call(instance);

    expect(instance.data.noticeMessage).toBe('');
    expect(actionMock).toHaveBeenCalledTimes(2);
    expect(runtime.wx?.navigateTo).not.toHaveBeenCalled();
  },
);
