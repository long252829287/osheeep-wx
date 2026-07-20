import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RecipeImageAsset } from '../miniprogram/types/recipe';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string): string => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

interface ImagePageData {
  loading: boolean;
  loadErrorMessage: string;
  searchQuery: string;
  assets: RecipeImageAsset[];
  visibleAssets: RecipeImageAsset[];
  selectedId: number;
  selectingId: number;
  selectionLocked: boolean;
  interactionErrorMessage: string;
}

interface ValueEvent {
  detail: { value: string };
}

interface TouchEvent {
  currentTarget: { dataset: { id?: number | string } };
}

interface EventChannelMock {
  emit: jest.Mock<void, [string, RecipeImageAsset]>;
}

interface ImagePageInstance {
  data: ImagePageData;
  setData(update: Partial<ImagePageData>, callback?: () => void): void;
  getOpenerEventChannel(): EventChannelMock | undefined;
  onLoad(): Promise<void>;
  onRetry(): Promise<void>;
  onUnload(): void;
  onSearchInput(event: ValueEvent): void;
  onMarkImage(event: TouchEvent): void;
  onSelectImage(event: TouchEvent): void;
  onCopySource(event: TouchEvent): void;
}

interface ImagePageDefinition extends ImagePageInstance {
  data: ImagePageData;
}

interface AppMock {
  listRecipeImages: jest.Mock<Promise<RecipeImageAsset[]>, [string]>;
}

interface NavigateBackOptions {
  delta: number;
  success?: () => void;
  fail?: () => void;
}

interface ClipboardOptions {
  data: string;
  success?: () => void;
  fail?: () => void;
}

interface WxMock {
  navigateBack: jest.Mock<void, [NavigateBackOptions]>;
  setClipboardData: jest.Mock<void, [ClipboardOptions]>;
}

const runtime = globalThis as unknown as {
  Page?: (definition: ImagePageDefinition) => void;
  getApp?: () => AppMock;
  wx?: WxMock;
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;
const pageInstances: ImagePageInstance[] = [];

const approvedImage = (
  id: number,
  displayName = `已审核图片 ${id}`,
): RecipeImageAsset => ({
  id,
  displayName,
  listUrl: `/media/recipes/${String(id)}-list.webp`,
  detailUrl: `/media/recipes/${String(id)}-detail.webp`,
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Tomato_with_egg.jpg',
  author: id === 4 ? 'Kaap bij Sneeuw' : 'Another Author',
  licenseName: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  acquiredOn: '2026-07-16',
  width: 640,
  height: 480,
});

const loadImagePage = async (): Promise<ImagePageDefinition> => {
  const previousPage = runtime.Page;
  let captured: ImagePageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };
  try {
    await jest.isolateModulesAsync(async () => {
      await import('../miniprogram/pages/recipe-images/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }
  if (!captured) throw new Error('Recipe images Page was not captured');
  return captured;
};

const createPageInstance = (
  definition: ImagePageDefinition,
  channel: EventChannelMock | undefined,
): ImagePageInstance => {
  const page: ImagePageInstance = {
    ...definition,
    data: {
      ...definition.data,
      assets: [...definition.data.assets],
      visibleAssets: [...definition.data.visibleAssets],
    },
    setData(update: Partial<ImagePageData>, callback?: () => void) {
      Object.assign(this.data, update);
      callback?.();
    },
    getOpenerEventChannel: () => channel,
  };
  pageInstances.push(page);
  return page;
};

const deferred = <T>() => {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

beforeEach(() => {
  pageInstances.length = 0;
  runtime.wx = {
    navigateBack: jest.fn<void, [NavigateBackOptions]>((options) => {
      options.success?.();
    }),
    setClipboardData: jest.fn<void, [ClipboardOptions]>((options) => {
      options.success?.();
    }),
  };
});

afterEach(() => {
  for (const page of pageInstances) page.onUnload();
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('renders only approved API image surfaces, provenance and accessible states', () => {
  const config = readProjectFile('miniprogram/pages/recipe-images/index.json');
  const wxml = readProjectFile('miniprogram/pages/recipe-images/index.wxml');
  const wxss = readProjectFile('miniprogram/pages/recipe-images/index.wxss');

  expect(config).toContain('"navigationBarTitleText": "选择真实图片"');
  expect(config).toContain('"navigationBarBackgroundColor": "#FFFAF3"');
  for (const label of ['作者', '许可', '来源', '获取日期', '复制来源地址']) {
    expect(wxml).toContain(label);
  }
  expect(wxml).toContain('bindtap="onRetry"');
  expect(wxml).toContain('bindtap="onSelectImage"');
  expect(wxml).toContain('bindtap="onMarkImage"');
  expect(wxml).toContain('bindtap="onCopySource"');
  expect(wxml).toContain('disabled="{{selectionLocked}}"');
  expect(wxml).toContain('disabled="{{selectionLocked || selectingId !== 0}}"');
  expect(wxml).toContain('aria-role="alert"');
  expect(wxml).toContain('aria-live="polite"');
  expect(wxml).not.toMatch(/\srole="/);
  expect(wxml).not.toContain('chooseMedia');
  expect(wxml).not.toContain('上传');
  expect(wxml).not.toContain('拍照');
  expect(wxss).toMatch(/\.page-shell\s*\{[^}]*padding:[^;]*38rpx/s);
  expect(wxss).toMatch(/\.search-field\s*\{[^}]*min-height:\s*88rpx;/s);
  expect(wxss).toMatch(/\.select-button\s*\{[^}]*min-height:\s*88rpx;/s);
  expect(wxss).toMatch(/\.image-action-bar\s*\{[^}]*position:\s*fixed;/s);
  expect(wxss).toContain('env(safe-area-inset-bottom)');
  for (const className of ['retry-button', 'copy-button', 'asset-choice']) {
    expect(wxss).toMatch(
      new RegExp(`\\.${className}\\s*\\{[^}]*min-height:\\s*88rpx;`, 's'),
    );
  }
  expect(wxss).not.toMatch(/[^@]\[[^\]]+\]\s*\{/);
  const colors = [...wxss.matchAll(/#[0-9a-fA-F]{6}/g)].map(([color]) =>
    color.toUpperCase(),
  );
  expect(new Set(colors)).toEqual(
    new Set(['#FFFAF3', '#CA5325', '#7B823B', '#282722']),
  );
});

test('exposes only API results and emits the exact selected metadata', async () => {
  const image = approvedImage(4, '番茄炒鸡蛋');
  const app: AppMock = {
    listRecipeImages: jest.fn().mockResolvedValue([image]),
  };
  const channel: EventChannelMock = { emit: jest.fn() };
  runtime.getApp = () => app;
  const page = createPageInstance(await loadImagePage(), channel);

  await page.onLoad();
  page.onSelectImage({ currentTarget: { dataset: { id: 4 } } });

  expect(app.listRecipeImages).toHaveBeenCalledWith('');
  expect(page.data.assets).toEqual([image]);
  expect(channel.emit).toHaveBeenCalledWith('imageSelected', image);
  expect(runtime.wx?.navigateBack).toHaveBeenCalledWith(
    expect.objectContaining({ delta: 1 }),
  );
});

test('filters loaded assets locally by name or author without another API call', async () => {
  const app: AppMock = {
    listRecipeImages: jest
      .fn()
      .mockResolvedValue([
        approvedImage(4, '番茄炒鸡蛋'),
        approvedImage(5, '青椒炒肉'),
      ]),
  };
  runtime.getApp = () => app;
  const page = createPageInstance(await loadImagePage(), { emit: jest.fn() });
  await page.onLoad();

  page.onSearchInput({ detail: { value: 'Kaap' } });
  expect(page.data.visibleAssets.map((asset) => asset.id)).toEqual([4]);
  page.onSearchInput({ detail: { value: '青椒' } });
  expect(page.data.visibleAssets.map((asset) => asset.id)).toEqual([5]);
  expect(app.listRecipeImages).toHaveBeenCalledTimes(1);
});

test('selects only a currently visible API asset', async () => {
  const app: AppMock = {
    listRecipeImages: jest
      .fn()
      .mockResolvedValue([
        approvedImage(4, '番茄炒鸡蛋'),
        approvedImage(5, '青椒炒肉'),
      ]),
  };
  const channel: EventChannelMock = { emit: jest.fn() };
  runtime.getApp = () => app;
  const page = createPageInstance(await loadImagePage(), channel);
  await page.onLoad();
  page.onSearchInput({ detail: { value: '青椒' } });

  page.onSelectImage({ currentTarget: { dataset: { id: 4 } } });

  expect(channel.emit).not.toHaveBeenCalled();
  expect(runtime.wx?.navigateBack).not.toHaveBeenCalled();
});

test('failed return locks the first emitted image and retries it without re-emitting', async () => {
  const image = approvedImage(4);
  const otherImage = approvedImage(5, '青椒炒肉');
  const app: AppMock = {
    listRecipeImages: jest.fn().mockResolvedValue([image, otherImage]),
  };
  const channel: EventChannelMock = { emit: jest.fn() };
  runtime.getApp = () => app;
  runtime.wx?.navigateBack
    .mockImplementationOnce((options) => options.fail?.())
    .mockImplementationOnce((options) => options.success?.());
  const page = createPageInstance(await loadImagePage(), channel);
  await page.onLoad();

  page.onSelectImage({ currentTarget: { dataset: { id: 4 } } });
  expect(page.data.selectionLocked).toBe(true);
  expect(page.data.selectedId).toBe(4);

  page.onSearchInput({ detail: { value: '青椒' } });
  page.onMarkImage({ currentTarget: { dataset: { id: 5 } } });

  expect(page.data.searchQuery).toBe('');
  expect(page.data.selectedId).toBe(4);

  page.onSelectImage({ currentTarget: { dataset: { id: 4 } } });

  expect(channel.emit).toHaveBeenCalledTimes(1);
  expect(channel.emit).toHaveBeenCalledWith('imageSelected', image);
  expect(runtime.wx?.navigateBack).toHaveBeenCalledTimes(2);
});

test('missing opener event channel keeps the page stable without navigating back', async () => {
  const app: AppMock = {
    listRecipeImages: jest.fn().mockResolvedValue([approvedImage(4)]),
  };
  runtime.getApp = () => app;
  const page = createPageInstance(await loadImagePage(), undefined);
  await page.onLoad();

  page.onSelectImage({ currentTarget: { dataset: { id: 4 } } });

  expect(page.data.interactionErrorMessage).toBe(
    '暂时无法返回所选图片，请重试',
  );
  expect(runtime.wx?.navigateBack).not.toHaveBeenCalled();
});

test('load failure is retryable and a stale response cannot replace the retry', async () => {
  const first = deferred<RecipeImageAsset[]>();
  const second = deferred<RecipeImageAsset[]>();
  const app: AppMock = {
    listRecipeImages: jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise),
  };
  runtime.getApp = () => app;
  const page = createPageInstance(await loadImagePage(), { emit: jest.fn() });

  const initial = page.onLoad();
  const retry = page.onRetry();
  second.resolve([approvedImage(5)]);
  await retry;
  first.reject(new Error('late failure'));
  await initial;

  expect(page.data.assets.map((asset) => asset.id)).toEqual([5]);
  expect(page.data.loadErrorMessage).toBe('');
  expect(page.data.loading).toBe(false);
});

test('unload ignores late load responses and invalid selections', async () => {
  const pending = deferred<RecipeImageAsset[]>();
  const app: AppMock = {
    listRecipeImages: jest.fn().mockReturnValue(pending.promise),
  };
  const channel: EventChannelMock = { emit: jest.fn() };
  runtime.getApp = () => app;
  const page = createPageInstance(await loadImagePage(), channel);
  const loading = page.onLoad();
  page.onUnload();
  const snapshot = JSON.stringify(page.data);

  pending.resolve([approvedImage(4)]);
  await loading;
  page.onSelectImage({ currentTarget: { dataset: { id: 999 } } });

  expect(JSON.stringify(page.data)).toBe(snapshot);
  expect(channel.emit).not.toHaveBeenCalled();
  expect(runtime.wx?.navigateBack).not.toHaveBeenCalled();
});

test('copies only the displayed approved source and never opens arbitrary URLs', async () => {
  const image = approvedImage(4);
  const app: AppMock = {
    listRecipeImages: jest.fn().mockResolvedValue([image]),
  };
  runtime.getApp = () => app;
  const page = createPageInstance(await loadImagePage(), { emit: jest.fn() });
  await page.onLoad();

  page.onCopySource({ currentTarget: { dataset: { id: 4 } } });
  page.onCopySource({ currentTarget: { dataset: { id: 999 } } });

  expect(runtime.wx?.setClipboardData).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.setClipboardData).toHaveBeenCalledWith(
    expect.objectContaining({ data: image.sourcePageUrl }),
  );
  const source = readProjectFile('miniprogram/pages/recipe-images/index.ts');
  expect(source).not.toContain('openEmbeddedMiniProgram');
  expect(source).not.toContain('navigateToMiniProgram');
  expect(source).not.toContain('web-view');
});
