import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RecordDetail, RecordDish } from '../miniprogram/types/record';
import type { RecordDishPresentation } from '../miniprogram/utils/record-detail';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

interface RecordDetailPageData {
  loading: boolean;
  record: RecordDetail | null;
  dishes: RecordDishPresentation[];
  errorMessage: string;
}

interface RecordDetailPageInstance {
  data: RecordDetailPageData;
  setData(update: Partial<RecordDetailPageData>): void;
  onLoad(query: Record<string, string | undefined>): Promise<void>;
  onBackToTonight(): void;
  onBackToRecords(): void;
}

interface RecordDetailPageDefinition extends RecordDetailPageInstance {
  data: RecordDetailPageData;
}

interface AppMock {
  getRecord: jest.Mock<Promise<RecordDetail>, [number]>;
}

const runtime = globalThis as unknown as {
  Page?: (definition: RecordDetailPageDefinition) => void;
  getApp?: () => AppMock;
  wx?: {
    reLaunch: jest.Mock;
  };
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;

const loadRecordDetailPage = async (): Promise<RecordDetailPageDefinition> => {
  const previousPage = runtime.Page;
  let captured: RecordDetailPageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };

  try {
    await jest.isolateModulesAsync(async () => {
      await import('../miniprogram/pages/record-detail/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured) {
    throw new Error('Record detail Page definition was not captured');
  }
  return captured;
};

const createInstance = (
  definition: RecordDetailPageDefinition,
): RecordDetailPageInstance => ({
  ...definition,
  data: {
    ...definition.data,
    dishes: [...(definition.data.dishes ?? [])],
  },
  setData(update: Partial<RecordDetailPageData>) {
    Object.assign(this.data, update);
  },
});

const householdDish: RecordDish = {
  recipeId: 14,
  name: '番茄炒蛋',
  imagePath: null,
  category: '家常菜',
  flavor: '酸甜',
  estimatedMinutes: 15,
  source: 'BOTH',
  scope: 'HOUSEHOLD',
  recipeVersion: 8,
  servings: 2,
  method: {
    id: 21,
    name: '家常做法',
    cookingStyle: '炒',
    steps: [
      { instruction: '盛盘', sortOrder: 1 },
      { instruction: '翻炒', sortOrder: 0 },
    ],
  },
  ingredients: [
    {
      ingredientId: 2,
      name: '鸡蛋',
      quantity: null,
      unit: '枚',
      required: true,
      sortOrder: 1,
    },
    {
      ingredientId: 1,
      name: '番茄',
      quantity: 2,
      unit: '个',
      required: true,
      sortOrder: 0,
    },
  ],
};

const legacyDish: RecordDish = {
  recipeId: 1,
  name: '素炒时蔬',
  imagePath: '/assets/recipes/vegetables.jpg',
  category: '家常菜',
  flavor: '清淡',
  estimatedMinutes: 10,
  source: 'ME',
  scope: 'SYSTEM',
  recipeVersion: 1,
  servings: null,
  method: null,
  ingredients: [],
};

const record = (
  dishes: RecordDish[] = [householdDish, legacyDish],
): RecordDetail => ({
  id: 91,
  recordDate: '2026-07-21',
  completedBy: 7,
  completedAt: '2026-07-21T12:30:00Z',
  dishes,
});

const createAppMock = (): AppMock => ({
  getRecord: jest
    .fn<Promise<RecordDetail>, [number]>()
    .mockResolvedValue(record()),
});

beforeEach(() => {
  runtime.wx = {
    reLaunch: jest.fn(),
  };
});

afterEach(() => {
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('renders snapshot-only details with guarded sections and null-image fallback', () => {
  const wxml = readProjectFile('miniprogram/pages/record-detail/index.wxml');
  const wxss = readProjectFile('miniprogram/pages/record-detail/index.wxss');

  expect(wxml).toContain('今晚一起吃的晚饭');
  expect(wxml).toContain('wx:for="{{dishes}}"');
  expect(wxml).not.toContain('wx:for="{{record.dishes}}"');
  expect(wxml).toContain('wx:if="{{item.imagePath}}"');
  expect(wxml).toContain('dish-image--placeholder');
  expect(wxml).toContain('/assets/icons/bowl-muted.svg');
  expect(wxml).toContain('{{item.name}}，暂无菜品图片');
  expect(wxml).toContain('wx:if="{{item.scopeLabel}}"');
  expect(wxml).toContain('{{item.scopeLabel}}');
  expect(wxml).toContain('wx:if="{{item.showSnapshotDetails}}"');
  expect(wxml).toContain('wx:if="{{item.method}}"');
  expect(wxml).toContain('{{item.method.name}}');
  expect(wxml).toContain('{{item.method.cookingStyle}}');
  expect(wxml).toContain('wx:for="{{item.method.steps}}"');
  expect(wxml).toContain('wx:if="{{item.ingredients.length}}"');
  expect(wxml).toContain('wx:for="{{item.ingredients}}"');
  expect(wxml).toContain('{{ingredient.amountLabel}}');
  expect(wxml).toContain('做法');
  expect(wxml).toContain('食材');
  expect(wxml).not.toContain('未知做法');
  expect(wxss).toContain('env(safe-area-inset-bottom)');
  expect(wxss).toMatch(
    /\.detail-page\s*\{[^}]*width:\s*100%;[^}]*overflow-x:\s*hidden;/s,
  );
  expect(wxss).toMatch(/\.dish-list\s*\{/);
  expect(wxss).toMatch(/\.snapshot-section\s*\{/);
  expect(wxss).toMatch(
    /\.primary-button,\s*\.secondary-button\s*\{[^}]*min-height:\s*(?:88|9\d)rpx;/s,
  );
});

test('builds ordered snapshot presentations and leaves legacy rows compact', async () => {
  const definition = await loadRecordDetailPage();
  const instance = createInstance(definition);
  const app = createAppMock();
  runtime.getApp = () => app;

  await definition.onLoad.call(instance, { id: '91' });

  expect(app.getRecord).toHaveBeenCalledWith(91);
  expect(instance.data.record).toEqual(record());
  expect(instance.data.dishes).toHaveLength(2);
  expect(instance.data.dishes[0]).toMatchObject({
    scopeLabel: '自家菜谱',
    showSnapshotDetails: true,
  });
  expect(
    instance.data.dishes[0].method?.steps.map((step) => step.instruction),
  ).toEqual(['翻炒', '盛盘']);
  expect(
    instance.data.dishes[0].ingredients.map((ingredient) => ({
      name: ingredient.name,
      amountLabel: ingredient.amountLabel,
    })),
  ).toEqual([
    { name: '番茄', amountLabel: '2个' },
    { name: '鸡蛋', amountLabel: '适量' },
  ]);
  expect(instance.data.dishes[1]).toMatchObject({
    scopeLabel: '',
    method: null,
    ingredients: [],
    showSnapshotDetails: false,
  });
  expect(instance.data.loading).toBe(false);
});

test.each([undefined, '0', '-1', 'abc', '1.5'])(
  'keeps the invalid-record recovery copy for id %s',
  async (id) => {
    const definition = await loadRecordDetailPage();
    const instance = createInstance(definition);
    const app = createAppMock();
    runtime.getApp = () => app;

    await definition.onLoad.call(instance, { id });

    expect(app.getRecord).not.toHaveBeenCalled();
    expect(instance.data.loading).toBe(false);
    expect(instance.data.errorMessage).toBe('这条记录不存在');
  },
);

test('keeps the request failure recovery copy', async () => {
  const definition = await loadRecordDetailPage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getRecord.mockRejectedValueOnce(new Error('offline'));
  runtime.getApp = () => app;

  await definition.onLoad.call(instance, { id: '91' });

  expect(instance.data.record).toBeNull();
  expect(instance.data.dishes).toEqual([]);
  expect(instance.data.loading).toBe(false);
  expect(instance.data.errorMessage).toBe('晚餐详情加载失败，请稍后重试');
});

test('keeps both existing back routes', async () => {
  const definition = await loadRecordDetailPage();
  const instance = createInstance(definition);

  definition.onBackToTonight.call(instance);
  definition.onBackToRecords.call(instance);

  expect(runtime.wx?.reLaunch).toHaveBeenNthCalledWith(1, {
    url: '/pages/tonight/index',
  });
  expect(runtime.wx?.reLaunch).toHaveBeenNthCalledWith(2, {
    url: '/pages/records/index',
  });
});
