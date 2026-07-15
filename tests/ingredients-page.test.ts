import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from '../miniprogram/services/request';
import type {
  Ingredient,
  InventoryItem,
  SaveInventoryItemInput,
} from '../miniprogram/types/ingredient';
import { toInventoryErrorMessage } from '../miniprogram/utils/inventory-errors';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

interface IngredientPageItem {
  ingredientId: number;
  name: string;
  category: string;
  quantity?: number | null;
  quantityInput: string;
  unit: string;
  version: number;
  saving: boolean;
  errorMessage: string;
}

interface IngredientGroup {
  category: string;
  items: IngredientPageItem[];
}

interface IngredientsData {
  loading: boolean;
  items: IngredientPageItem[];
  groups: IngredientGroup[];
  searchQuery: string;
  loadErrorMessage: string;
  hasInventory: boolean;
}

interface IngredientsInstance {
  data: IngredientsData;
  setData(update: Partial<IngredientsData>): void;
  loadInventory(): Promise<void>;
  refreshVisibleGroups(query?: string): void;
  updateItem(ingredientId: number, update: Partial<IngredientPageItem>): void;
  replaceSavedItem(saved: InventoryItem): void;
  recoverInventoryError(
    ingredientId: number,
    attemptedInput: string,
    error: unknown,
  ): Promise<void>;
}

interface IngredientsPageDefinition {
  data: IngredientsData;
  onShow(this: IngredientsInstance): Promise<void>;
  onRetry(this: IngredientsInstance): Promise<void>;
  loadInventory(this: IngredientsInstance): Promise<void>;
  onSearchInput(
    this: IngredientsInstance,
    event: { detail: { value: string } },
  ): void;
  onQuantityInput(
    this: IngredientsInstance,
    event: {
      detail: { value: string };
      currentTarget: { dataset: { id?: number | string } };
    },
  ): void;
  onSaveItem(
    this: IngredientsInstance,
    event: { currentTarget: { dataset: { id?: number | string } } },
  ): Promise<void>;
  refreshVisibleGroups: IngredientsInstance['refreshVisibleGroups'];
  updateItem: IngredientsInstance['updateItem'];
  replaceSavedItem: IngredientsInstance['replaceSavedItem'];
  recoverInventoryError: IngredientsInstance['recoverInventoryError'];
}

interface AppMock {
  getIngredients: jest.Mock<Promise<Ingredient[]>, []>;
  getInventory: jest.Mock<Promise<InventoryItem[]>, []>;
  saveInventoryItem: jest.Mock<
    Promise<InventoryItem>,
    [number, SaveInventoryItemInput]
  >;
}

const runtime = globalThis as unknown as {
  Page?: (definition: IngredientsPageDefinition) => void;
  getApp?: () => AppMock;
};

const originalGetApp = runtime.getApp;

const loadIngredientsPage = async (): Promise<IngredientsPageDefinition> => {
  const previousPage = runtime.Page;
  let captured: IngredientsPageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };

  try {
    await jest.isolateModulesAsync(async () => {
      await import('../miniprogram/pages/ingredients/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured)
    throw new Error('Ingredients Page definition was not captured');
  return captured;
};

const createInstance = (
  definition: IngredientsPageDefinition,
): IngredientsInstance => {
  const instance: IngredientsInstance = {
    data: {
      ...definition.data,
      items: [...definition.data.items],
      groups: [...definition.data.groups],
    },
    setData(update) {
      Object.assign(this.data, update);
    },
    loadInventory: definition.loadInventory,
    refreshVisibleGroups: definition.refreshVisibleGroups,
    updateItem: definition.updateItem,
    replaceSavedItem: definition.replaceSavedItem,
    recoverInventoryError: definition.recoverInventoryError,
  };
  return instance;
};

const ingredient = (
  id: number,
  name: string,
  category: string,
  defaultUnit = '克',
): Ingredient => ({ id, name, category, defaultUnit });

const inventoryItem = (
  ingredientId: number,
  overrides: Partial<InventoryItem> = {},
): InventoryItem => ({
  ingredientId,
  name: `食材 ${ingredientId}`,
  category: '蔬菜',
  quantity: 2,
  unit: '个',
  version: 3,
  updatedBy: 7,
  updatedAt: '2026-07-15T08:00:00Z',
  ...overrides,
});

const createAppMock = (options?: {
  ingredients?: Ingredient[];
  inventory?: InventoryItem[];
}): AppMock => ({
  getIngredients: jest
    .fn<Promise<Ingredient[]>, []>()
    .mockResolvedValue(options?.ingredients ?? []),
  getInventory: jest
    .fn<Promise<InventoryItem[]>, []>()
    .mockResolvedValue(options?.inventory ?? []),
  saveInventoryItem: jest
    .fn<Promise<InventoryItem>, [number, SaveInventoryItemInput]>()
    .mockResolvedValue(inventoryItem(1)),
});

afterEach(() => {
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
});

test('renders a quiet grouped utility list with every required state', () => {
  const pageConfig = readProjectFile(
    'miniprogram/pages/ingredients/index.json',
  );
  const wxml = readProjectFile('miniprogram/pages/ingredients/index.wxml');
  const wxss = readProjectFile('miniprogram/pages/ingredients/index.wxss');

  expect(pageConfig).toContain('食材库存');
  expect(wxml).toContain('bindinput="onSearchInput"');
  expect(wxml).toContain('bindinput="onQuantityInput"');
  expect(wxml).toContain('bindtap="onSaveItem"');
  expect(wxml).toContain('bindtap="onRetry"');
  expect(wxml).toContain('数量未知');
  expect(wxml).toContain('还没有记录库存');
  expect(wxml).toContain('没有找到匹配的食材');
  expect(wxml).toContain('wx:for="{{groups}}"');
  expect(wxml).toContain('wx:for="{{item.items}}"');
  expect(wxss).toContain('border-bottom: 1rpx solid');
  expect(wxss).not.toContain('.ingredient-row {\n  border-radius:');
});

test('loads catalog and inventory together, merging stock by ingredient id', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const app = createAppMock({
    ingredients: [
      ingredient(1, 'Tomato', 'Vegetable', '个'),
      ingredient(2, '鸡蛋', '蛋奶', '枚'),
      ingredient(3, '牛奶', '蛋奶', '毫升'),
    ],
    inventory: [
      inventoryItem(1, {
        name: 'Tomato',
        category: 'Vegetable',
        quantity: 3.5,
        unit: '个',
        version: 4,
      }),
    ],
  });
  runtime.getApp = () => app;

  await definition.onShow.call(instance);

  expect(app.getIngredients).toHaveBeenCalledTimes(1);
  expect(app.getInventory).toHaveBeenCalledTimes(1);
  expect(instance.data.loading).toBe(false);
  expect(instance.data.hasInventory).toBe(true);
  expect(instance.data.items).toEqual([
    expect.objectContaining({
      ingredientId: 1,
      quantityInput: '3.5',
      unit: '个',
      version: 4,
    }),
    expect.objectContaining({
      ingredientId: 2,
      quantityInput: '',
      unit: '枚',
      version: 0,
    }),
    expect.objectContaining({
      ingredientId: 3,
      quantityInput: '',
      unit: '毫升',
      version: 0,
    }),
  ]);
  expect(instance.data.groups.map((group) => group.category)).toEqual([
    'Vegetable',
    '蛋奶',
  ]);
});

test('searches trimmed ingredient names and categories case-insensitively', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  runtime.getApp = () =>
    createAppMock({
      ingredients: [
        ingredient(1, 'Cherry Tomato', 'Vegetable'),
        ingredient(2, '鸡蛋', 'Protein', '枚'),
        ingredient(3, '牛奶', 'Dairy', '毫升'),
      ],
    });
  await definition.onShow.call(instance);

  definition.onSearchInput.call(instance, {
    detail: { value: '  protein  ' },
  });
  expect(instance.data.groups).toHaveLength(1);
  expect(instance.data.groups[0].items[0].name).toBe('鸡蛋');

  definition.onSearchInput.call(instance, {
    detail: { value: 'TOMATO' },
  });
  expect(instance.data.groups[0].items[0].name).toBe('Cherry Tomato');

  definition.onSearchInput.call(instance, {
    detail: { value: 'missing' },
  });
  expect(instance.data.groups).toEqual([]);
});

test('saves a blank quantity as unknown and replaces the saved row', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const saved = inventoryItem(1, { quantity: null, version: 1, unit: '个' });
  const app = createAppMock({
    ingredients: [ingredient(1, '番茄', '蔬菜', '个')],
  });
  app.saveInventoryItem.mockResolvedValue(saved);
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  await definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });

  expect(app.saveInventoryItem).toHaveBeenCalledWith(1, {
    quantity: undefined,
    unit: '个',
    version: 0,
  });
  expect(instance.data.items[0]).toEqual(
    expect.objectContaining({
      quantityInput: '',
      version: 1,
      saving: false,
      errorMessage: '',
    }),
  );
  expect(instance.data.hasInventory).toBe(true);
});

test('rejects excessive precision without calling the save API', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const app = createAppMock({
    ingredients: [ingredient(1, '番茄', '蔬菜', '个')],
  });
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '1.2345' },
    currentTarget: { dataset: { id: 1 } },
  });

  await definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });

  expect(app.saveInventoryItem).not.toHaveBeenCalled();
  expect(instance.data.items[0].quantityInput).toBe('1.2345');
  expect(instance.data.items[0].errorMessage).toContain(
    '最多 9 位整数和 3 位小数',
  );
});

test('prevents a duplicate concurrent save for the same row', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const app = createAppMock({
    ingredients: [ingredient(1, '番茄', '蔬菜', '个')],
  });
  let resolveSave: ((item: InventoryItem) => void) | undefined;
  app.saveInventoryItem.mockImplementation(
    () =>
      new Promise((resolvePromise) => {
        resolveSave = resolvePromise;
      }),
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  const first = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });
  const second = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });
  expect(app.saveInventoryItem).toHaveBeenCalledTimes(1);

  resolveSave?.(inventoryItem(1, { quantity: null, version: 1 }));
  await Promise.all([first, second]);
});

test('preserves the attempted input and maps ordinary save errors', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const app = createAppMock({
    ingredients: [ingredient(1, '番茄', '蔬菜', '个')],
  });
  app.saveInventoryItem.mockRejectedValue(
    new ApiError('NETWORK_ERROR', 'offline'),
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '12.25' },
    currentTarget: { dataset: { id: 1 } },
  });

  await definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });

  expect(instance.data.items[0]).toEqual(
    expect.objectContaining({
      quantityInput: '12.25',
      saving: false,
      errorMessage: toInventoryErrorMessage('NETWORK_ERROR'),
    }),
  );
});

test('reloads a conflicting row but keeps its attempted input', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const app = createAppMock({
    ingredients: [ingredient(1, '番茄', '蔬菜', '个')],
    inventory: [inventoryItem(1, { quantity: 2, version: 3 })],
  });
  app.saveInventoryItem.mockRejectedValue(
    new ApiError('DINNER_INVENTORY_VERSION_CONFLICT', 'stale'),
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '5.5' },
    currentTarget: { dataset: { id: 1 } },
  });
  app.getInventory.mockResolvedValue([
    inventoryItem(1, { quantity: 4, version: 4 }),
  ]);

  await definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });

  expect(app.getIngredients).toHaveBeenCalledTimes(2);
  expect(app.getInventory).toHaveBeenCalledTimes(2);
  expect(instance.data.items[0]).toEqual(
    expect.objectContaining({
      quantity: 4,
      quantityInput: '5.5',
      version: 4,
      saving: false,
      errorMessage: toInventoryErrorMessage(
        'DINNER_INVENTORY_VERSION_CONFLICT',
      ),
    }),
  );
});

test('shows a retryable request error without discarding the query', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getIngredients.mockRejectedValue(
    new ApiError('NETWORK_ERROR', 'offline'),
  );
  runtime.getApp = () => app;
  instance.data.searchQuery = '番茄';

  await definition.onRetry.call(instance);

  expect(instance.data.loading).toBe(false);
  expect(instance.data.searchQuery).toBe('番茄');
  expect(instance.data.loadErrorMessage).toBe(
    toInventoryErrorMessage('NETWORK_ERROR'),
  );
});
