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
  emptySearch: boolean;
  loadErrorMessage: string;
  hasInventory: boolean;
  catalogEmpty: boolean;
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

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

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
  expect(wxml).toContain('wx:if="{{catalogEmpty}}"');
  expect(wxml).toContain('wx:if="{{!hasInventory && !emptySearch}}"');
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

test('preserves another concurrent save while a conflict refresh is applied', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const refreshedInventory = deferred<InventoryItem[]>();
  const secondSave = deferred<InventoryItem>();
  const app = createAppMock({
    ingredients: [
      ingredient(1, '番茄', '蔬菜', '个'),
      ingredient(2, '鸡蛋', '蛋奶', '枚'),
    ],
    inventory: [
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ],
  });
  app.getInventory
    .mockResolvedValueOnce([
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ])
    .mockImplementationOnce(() => refreshedInventory.promise);
  app.saveInventoryItem.mockImplementation((ingredientId) =>
    ingredientId === 1
      ? Promise.reject(
          new ApiError('DINNER_INVENTORY_VERSION_CONFLICT', 'stale'),
        )
      : secondSave.promise,
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '5' },
    currentTarget: { dataset: { id: 1 } },
  });
  definition.onQuantityInput.call(instance, {
    detail: { value: '8' },
    currentTarget: { dataset: { id: 2 } },
  });

  const conflictSave = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });
  const concurrentSave = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 2 } },
  });
  await flushPromises();
  refreshedInventory.resolve([
    inventoryItem(1, { quantity: 3, version: 4 }),
    inventoryItem(2, { quantity: 6, version: 4, unit: '枚' }),
  ]);
  await conflictSave;

  expect(instance.data.items[1]).toEqual(
    expect.objectContaining({
      quantity: 6,
      quantityInput: '8',
      version: 4,
      saving: true,
    }),
  );

  secondSave.resolve(inventoryItem(2, { quantity: 8, version: 5, unit: '枚' }));
  await concurrentSave;
  expect(instance.data.items[1]).toEqual(
    expect.objectContaining({ quantity: 8, version: 5, saving: false }),
  );
});

test('adopts newer canonical fields while preserving a target edit made during conflict refresh', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const refreshedInventory = deferred<InventoryItem[]>();
  const app = createAppMock({
    ingredients: [ingredient(1, '番茄', '蔬菜', '个')],
    inventory: [inventoryItem(1, { quantity: 2, version: 3, unit: '个' })],
  });
  app.getInventory
    .mockResolvedValueOnce([
      inventoryItem(1, { quantity: 2, version: 3, unit: '个' }),
    ])
    .mockImplementationOnce(() => refreshedInventory.promise);
  app.saveInventoryItem.mockRejectedValue(
    new ApiError('DINNER_INVENTORY_VERSION_CONFLICT', 'stale'),
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '5' },
    currentTarget: { dataset: { id: 1 } },
  });

  const conflictSave = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });
  await flushPromises();
  expect(app.getInventory).toHaveBeenCalledTimes(2);

  definition.onQuantityInput.call(instance, {
    detail: { value: '7' },
    currentTarget: { dataset: { id: 1 } },
  });
  refreshedInventory.resolve([
    inventoryItem(1, { quantity: 4, version: 4, unit: '斤' }),
  ]);
  await conflictSave;

  expect(instance.data.items[0]).toEqual(
    expect.objectContaining({
      quantity: 4,
      quantityInput: '7',
      unit: '斤',
      version: 4,
      saving: false,
      errorMessage: toInventoryErrorMessage(
        'DINNER_INVENTORY_VERSION_CONFLICT',
      ),
    }),
  );
});

test('adopts newer canonical fields while preserving a non-target save started during conflict refresh', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const refreshedInventory = deferred<InventoryItem[]>();
  const secondSave = deferred<InventoryItem>();
  const app = createAppMock({
    ingredients: [
      ingredient(1, '番茄', '蔬菜', '个'),
      ingredient(2, '鸡蛋', '蛋奶', '枚'),
    ],
    inventory: [
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ],
  });
  app.getInventory
    .mockResolvedValueOnce([
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ])
    .mockImplementationOnce(() => refreshedInventory.promise);
  app.saveInventoryItem.mockImplementation((ingredientId) =>
    ingredientId === 1
      ? Promise.reject(
          new ApiError('DINNER_INVENTORY_VERSION_CONFLICT', 'stale'),
        )
      : secondSave.promise,
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '5' },
    currentTarget: { dataset: { id: 1 } },
  });

  const conflictSave = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });
  await flushPromises();
  expect(app.getInventory).toHaveBeenCalledTimes(2);

  definition.onQuantityInput.call(instance, {
    detail: { value: '8' },
    currentTarget: { dataset: { id: 2 } },
  });
  const concurrentSave = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 2 } },
  });
  refreshedInventory.resolve([
    inventoryItem(1, { quantity: 3, version: 4 }),
    inventoryItem(2, { quantity: 6, version: 5, unit: '盒' }),
  ]);
  await conflictSave;

  expect(instance.data.items[1]).toEqual(
    expect.objectContaining({
      quantity: 6,
      quantityInput: '8',
      unit: '盒',
      version: 5,
      saving: true,
      errorMessage: '',
    }),
  );

  secondSave.resolve(inventoryItem(2, { quantity: 8, version: 6, unit: '盒' }));
  await concurrentSave;
});

test('does not let a stale conflict refresh overwrite a newer save result', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const refreshedInventory = deferred<InventoryItem[]>();
  const app = createAppMock({
    ingredients: [
      ingredient(1, '番茄', '蔬菜', '个'),
      ingredient(2, '鸡蛋', '蛋奶', '枚'),
    ],
    inventory: [
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ],
  });
  app.getInventory
    .mockResolvedValueOnce([
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ])
    .mockImplementationOnce(() => refreshedInventory.promise);
  app.saveInventoryItem.mockImplementation((ingredientId) =>
    ingredientId === 1
      ? Promise.reject(
          new ApiError('DINNER_INVENTORY_VERSION_CONFLICT', 'stale'),
        )
      : Promise.resolve(
          inventoryItem(2, { quantity: 9, version: 6, unit: '枚' }),
        ),
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '5' },
    currentTarget: { dataset: { id: 1 } },
  });
  definition.onQuantityInput.call(instance, {
    detail: { value: '9' },
    currentTarget: { dataset: { id: 2 } },
  });

  const conflictSave = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });
  await flushPromises();
  await definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 2 } },
  });
  expect(instance.data.items[1].version).toBe(6);

  refreshedInventory.resolve([
    inventoryItem(1, { quantity: 3, version: 4 }),
    inventoryItem(2, { quantity: 5, version: 4, unit: '枚' }),
  ]);
  await conflictSave;

  expect(instance.data.items[1]).toEqual(
    expect.objectContaining({
      quantity: 9,
      quantityInput: '9',
      version: 6,
      saving: false,
      errorMessage: '',
    }),
  );
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

test('preserves target input and non-target state when conflict refresh fails', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  const secondSave = deferred<InventoryItem>();
  const app = createAppMock({
    ingredients: [
      ingredient(1, '番茄', '蔬菜', '个'),
      ingredient(2, '鸡蛋', '蛋奶', '枚'),
    ],
    inventory: [
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ],
  });
  app.getInventory
    .mockResolvedValueOnce([
      inventoryItem(1, { quantity: 2, version: 3 }),
      inventoryItem(2, { quantity: 4, version: 3, unit: '枚' }),
    ])
    .mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'offline'));
  app.saveInventoryItem.mockImplementation((ingredientId) =>
    ingredientId === 1
      ? Promise.reject(
          new ApiError('DINNER_INVENTORY_VERSION_CONFLICT', 'stale'),
        )
      : secondSave.promise,
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  definition.onQuantityInput.call(instance, {
    detail: { value: '5.5' },
    currentTarget: { dataset: { id: 1 } },
  });
  definition.onQuantityInput.call(instance, {
    detail: { value: '8' },
    currentTarget: { dataset: { id: 2 } },
  });

  const concurrentSave = definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 2 } },
  });
  await definition.onSaveItem.call(instance, {
    currentTarget: { dataset: { id: 1 } },
  });

  expect(instance.data.items[0]).toEqual(
    expect.objectContaining({
      quantityInput: '5.5',
      saving: false,
      errorMessage: toInventoryErrorMessage('NETWORK_ERROR'),
    }),
  );
  expect(instance.data.items[1]).toEqual(
    expect.objectContaining({
      quantityInput: '8',
      saving: true,
      errorMessage: '',
      version: 3,
    }),
  );

  secondSave.resolve(inventoryItem(2, { quantity: 8, version: 4, unit: '枚' }));
  await concurrentSave;
});

test('shows an empty catalog and hides inventory-only stale rows', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  runtime.getApp = () =>
    createAppMock({
      ingredients: [],
      inventory: [inventoryItem(99, { name: '停用食材', version: 8 })],
    });

  await definition.onShow.call(instance);

  expect(instance.data.catalogEmpty).toBe(true);
  expect(instance.data.hasInventory).toBe(true);
  expect(instance.data.items).toEqual([]);
  expect(instance.data.groups).toEqual([]);
});

test('uses only empty-catalog state when catalog and inventory are empty', async () => {
  const definition = await loadIngredientsPage();
  const instance = createInstance(definition);
  runtime.getApp = () => createAppMock();
  instance.data.searchQuery = '番茄';

  await definition.onShow.call(instance);

  expect(instance.data).toEqual(
    expect.objectContaining({
      loading: false,
      catalogEmpty: true,
      hasInventory: false,
      emptySearch: false,
      items: [],
      groups: [],
      loadErrorMessage: '',
      searchQuery: '番茄',
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
