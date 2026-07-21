import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from '../miniprogram/services/request';
import type { InventoryItem } from '../miniprogram/types/ingredient';
import type { TodayMenu } from '../miniprogram/types/menu';
import type {
  RecipeDiscoveryQuery,
  RecipeMatch,
  RecipeSummary,
} from '../miniprogram/types/recipe';
import type { RecipeCardView } from '../miniprogram/utils/recipe-discovery';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

interface PageRecipeCard extends RecipeCardView {
  added: boolean;
}

interface FilterIngredient {
  ingredientId: number;
  name: string;
  state: 'neutral' | 'include' | 'exclude';
  stateLabel: string;
}

interface RecipePageData {
  loading: boolean;
  refreshing: boolean;
  recipesLoaded: boolean;
  inventory: InventoryItem[];
  featured: PageRecipeCard | null;
  rows: PageRecipeCard[];
  pantrySummary: string;
  visibleIngredients: InventoryItem[];
  hasMoreIngredients: boolean;
  ingredientsExpanded: boolean;
  filtersOpen: boolean;
  selectableIngredients: FilterIngredient[];
  onlyCookable: boolean;
  includeIngredientIds: number[];
  excludeIngredientIds: number[];
  menuId: number;
  menuDate: string;
  menuVersion: number;
  mySelectedRecipeIds: number[];
  savingRecipeId: number;
  pendingRecipeId: number;
  loadErrorMessage: string;
  refreshMessage: string;
  actionMessage: string;
  conflictMessage: string;
}

interface RecipePageInstance {
  data: RecipePageData;
  setData(update: Partial<RecipePageData>): void;
  onShow(): Promise<void>;
  onRetry(): Promise<void>;
  onToggleOnlyCookable(event: SwitchEvent): Promise<void>;
  onToggleFiltersPanel(): void;
  onToggleIngredientsExpanded(): void;
  onCycleIngredientFilter(event: RecipeEvent): Promise<void>;
  onResetFilters(): Promise<void>;
  onAddToTonight(event: RecipeEvent): Promise<void>;
  onOpenHouseholdRecipes(): void;
  onOpenIngredients(): void;
  reloadRecipes(): Promise<void>;
  recoverMenuConflict(recipeId: number): Promise<void>;
  applyMenu(menu: TodayMenu): boolean;
  currentQuery(): RecipeDiscoveryQuery;
}

interface RecipePageDefinition extends RecipePageInstance {
  data: RecipePageData;
}

interface RecipeEvent {
  currentTarget: { dataset: { id?: number | string } };
}

interface SwitchEvent {
  detail: { value: boolean };
}

interface AppMock {
  getInventory: jest.Mock<Promise<InventoryItem[]>, []>;
  getRecipes: jest.Mock<Promise<RecipeSummary[]>, [RecipeDiscoveryQuery]>;
  getTodayMenu: jest.Mock<Promise<TodayMenu>, []>;
  saveSelections: jest.Mock<Promise<TodayMenu>, [number[], number]>;
}

const runtime = globalThis as unknown as {
  Page?: (definition: RecipePageDefinition) => void;
  getApp?: () => AppMock;
  wx?: {
    showToast: jest.Mock;
    navigateTo: jest.Mock;
  };
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;

const loadRecipePage = async (): Promise<RecipePageDefinition> => {
  const previousPage = runtime.Page;
  let captured: RecipePageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };

  try {
    await jest.isolateModulesAsync(async () => {
      await import('../miniprogram/pages/recipes/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured) throw new Error('Recipe Page definition was not captured');
  return captured;
};

const createInstance = (
  definition: RecipePageDefinition,
): RecipePageInstance => {
  const instance = {
    ...definition,
    data: {
      ...definition.data,
      inventory: [...definition.data.inventory],
      rows: [...definition.data.rows],
      visibleIngredients: [...definition.data.visibleIngredients],
      selectableIngredients: [...definition.data.selectableIngredients],
      includeIngredientIds: [...definition.data.includeIngredientIds],
      excludeIngredientIds: [...definition.data.excludeIngredientIds],
      mySelectedRecipeIds: [...definition.data.mySelectedRecipeIds],
    },
    setData(update: Partial<RecipePageData>) {
      Object.assign(this.data, update);
    },
  };
  return instance;
};

const recipeMatch = (
  status: RecipeMatch['status'] = 'AVAILABLE',
): RecipeMatch => ({
  status,
  matchedRequired: status === 'AVAILABLE' ? 2 : 1,
  totalRequired: 2,
  matchPercent: status === 'AVAILABLE' ? 100 : 50,
  missingIngredients: status === 'MISSING' ? ['葱'] : [],
  unknownQuantityIngredients: status === 'UNKNOWN_QUANTITY' ? ['鸡蛋'] : [],
});

const recipe = (id: number, ingredientIds: number[] = [id]): RecipeSummary => ({
  id,
  name: `菜谱 ${id}`,
  imagePath: `/assets/recipes/${id}.jpg`,
  category: '家常菜',
  flavor: '咸鲜',
  estimatedMinutes: 20,
  scope: 'SYSTEM',
  version: 1,
  defaultMethod: null,
  ingredients: ingredientIds.map((ingredientId) => ({
    ingredientId,
    name: `食材 ${ingredientId}`,
    quantity: 1,
    unit: '份',
    required: true,
    sortOrder: ingredientId,
  })),
  match: recipeMatch(),
});

const inventoryItem = (ingredientId: number): InventoryItem => ({
  ingredientId,
  name: `库存 ${ingredientId}`,
  category: '家常',
  quantity: 1,
  unit: '份',
  version: 1,
  updatedBy: 7,
  updatedAt: '2026-07-15T08:00:00Z',
});

const menu = (
  version: number,
  selectedRecipeIds: number[] = [],
  identity: { id: number; menuDate: string } = {
    id: 1,
    menuDate: '2026-07-15',
  },
): TodayMenu => ({
  id: identity.id,
  menuDate: identity.menuDate,
  status: 'DRAFT',
  version,
  mySelectionCount: selectedRecipeIds.length,
  partnerSelectionCount: 0,
  consensusCount: 0,
  selectedRecipeIds,
  dishes: [],
});

const createAppMock = (): AppMock => ({
  getInventory: jest.fn<Promise<InventoryItem[]>, []>().mockResolvedValue([]),
  getRecipes: jest
    .fn<Promise<RecipeSummary[]>, [RecipeDiscoveryQuery]>()
    .mockResolvedValue([]),
  getTodayMenu: jest.fn<Promise<TodayMenu>, []>().mockResolvedValue(menu(1)),
  saveSelections: jest
    .fn<Promise<TodayMenu>, [number[], number]>()
    .mockResolvedValue(menu(2)),
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

const eventFor = (id: number): RecipeEvent => ({
  currentTarget: { dataset: { id } },
});

const switchEvent = (value: boolean): SwitchEvent => ({ detail: { value } });

beforeEach(() => {
  runtime.wx = {
    showToast: jest.fn(),
    navigateTo: jest.fn(),
  };
});

afterEach(() => {
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('renders the approved discovery hierarchy and reachable states', () => {
  const pageConfig = readProjectFile('miniprogram/pages/recipes/index.json');
  const wxml = readProjectFile('miniprogram/pages/recipes/index.wxml');
  const wxss = readProjectFile('miniprogram/pages/recipes/index.wxss');

  expect(pageConfig).toContain('找菜');
  expect(wxml).toContain('今晚想吃什么？');
  expect(wxml).toContain('调整食材');
  expect(wxml).toContain('只看能做');
  expect(wxml).toContain('加入今晚菜单');
  expect(wxml).toContain('家庭菜谱');
  expect(wxml).toContain('食材库存');
  expect(wxml).toContain('bindtap="onCycleIngredientFilter"');
  expect(wxml).toContain('bindtap="onResetFilters"');
  expect(wxml).toContain('wx:if="{{hasMoreIngredients}}"');
  expect(wxml).toContain('bindtap="onToggleIngredientsExpanded"');
  expect(wxml).toContain("ingredientsExpanded ? '收起' : '展开全部'");
  expect(wxml).toContain('class="row-action');
  expect(wxml).not.toContain('class="row-chevron"');
  expect(wxml).toContain('bindtap="onRetry"');
  expect(wxml).toContain('aria-label="{{featured.name}}菜品图片"');
  expect(wxml).toContain('wx:if="{{featured.scopeLabel}}"');
  expect(wxml).toContain('wx:if="{{item.scopeLabel}}"');
  expect(wxml).toContain('{{featured.scopeLabel}}');
  expect(wxml).toContain('{{item.scopeLabel}}');
  expect(wxml).toContain('featured.ariaName + (featured.added');
  expect(wxml).toContain('item.ariaName + (item.added');
  expect(wxml).toContain("'，重试加入今晚菜单'");
  expect(wxml).toContain('<bottom-nav active="recipes" />');
  expect(wxss).toContain('env(safe-area-inset-bottom)');
  expect(wxss).toContain('@media (min-width: 430px)');
  expect(wxss).not.toContain('.add-button[disabled]');
  expect(wxss).not.toContain('.recipe-row[disabled]');
  expect(wxml).toContain("'add-button--disabled'");
  expect(wxml).toContain("'recipe-row--disabled'");
  expect(wxss).toMatch(
    /\.recipe-row\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*100%;[^}]*justify-content:\s*flex-start;/s,
  );
  expect(wxss).toMatch(/\.row-copy\s*\{[^}]*width:\s*0;[^}]*flex:\s*1 1 0%;/s);
  expect(wxss).toMatch(/\.pantry-expand\s*\{[^}]*min-height:\s*88rpx;/s);
  expect(wxss).toMatch(/\.recipe-scope-label\s*\{/);
  expect(wxss).toMatch(/\.recipe-title-line\s*\{[^}]*flex-wrap:\s*wrap;/s);
  expect(wxss).toMatch(/\.add-button\s*\{[^}]*flex:\s*0 0 auto;/s);
  expect(wxss).not.toMatch(
    /@media \(min-width: 430px\)[\s\S]*\.featured-image\s*\{[^}]*height:\s*390rpx;/,
  );
});

test('expands and collapses the complete household pantry summary', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);

  expect(instance.data.ingredientsExpanded).toBe(false);
  definition.onToggleIngredientsExpanded.call(instance);
  expect(instance.data.ingredientsExpanded).toBe(true);
  definition.onToggleIngredientsExpanded.call(instance);
  expect(instance.data.ingredientsExpanded).toBe(false);
});

test('loads inventory, exact current recipe query, and menu concurrently', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const inventoryRequest = deferred<InventoryItem[]>();
  const recipesRequest = deferred<RecipeSummary[]>();
  const menuRequest = deferred<TodayMenu>();
  const app = createAppMock();
  app.getInventory.mockReturnValue(inventoryRequest.promise);
  app.getRecipes.mockReturnValue(recipesRequest.promise);
  app.getTodayMenu.mockReturnValue(menuRequest.promise);
  runtime.getApp = () => app;

  const loading = definition.onShow.call(instance);

  expect(app.getInventory).toHaveBeenCalledTimes(1);
  expect(app.getRecipes).toHaveBeenCalledWith({
    includeIngredientIds: [],
    excludeIngredientIds: [],
    onlyCookable: false,
  });
  expect(app.getTodayMenu).toHaveBeenCalledTimes(1);

  inventoryRequest.resolve([1, 2, 3, 4].map(inventoryItem));
  recipesRequest.resolve([
    recipe(8, [1, 5]),
    recipe(9),
    recipe(10),
    recipe(11),
  ]);
  menuRequest.resolve(menu(4, [9]));
  await loading;

  expect(instance.data.loading).toBe(false);
  expect(
    instance.data.visibleIngredients.map((item) => item.ingredientId),
  ).toEqual([1, 2, 3]);
  expect(instance.data.featured?.id).toBe(8);
  expect(instance.data.rows.map((item) => item.id)).toEqual([9, 10]);
  expect(instance.data.rows[0].added).toBe(true);
  expect(
    instance.data.selectableIngredients.map((item) => item.ingredientId),
  ).toEqual([1, 2, 3, 4, 5, 9, 10, 11]);
});

test('cycles ingredient filters and sends exclusion-wins exact queries', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getInventory.mockResolvedValue([inventoryItem(1), inventoryItem(2)]);
  app.getRecipes.mockResolvedValue([recipe(7, [1, 2, 3])]);
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  await definition.onCycleIngredientFilter.call(instance, eventFor(1));
  expect(app.getRecipes).toHaveBeenLastCalledWith({
    includeIngredientIds: [1],
    excludeIngredientIds: [],
    onlyCookable: false,
  });

  await definition.onCycleIngredientFilter.call(instance, eventFor(1));
  expect(app.getRecipes).toHaveBeenLastCalledWith({
    includeIngredientIds: [],
    excludeIngredientIds: [1],
    onlyCookable: false,
  });

  instance.setData({
    includeIngredientIds: [3, 2, 1],
    excludeIngredientIds: [3, 4],
  });
  await definition.onToggleOnlyCookable.call(instance, switchEvent(true));
  expect(app.getRecipes).toHaveBeenLastCalledWith({
    includeIngredientIds: [1, 2],
    excludeIngredientIds: [3, 4],
    onlyCookable: true,
  });
  expect(instance.data.refreshing).toBe(false);
  expect(instance.data.featured?.id).toBe(7);
});

test('ignores a stale filter response and keeps rendered data while refreshing', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getInventory.mockResolvedValue([inventoryItem(1), inventoryItem(2)]);
  app.getRecipes.mockResolvedValueOnce([recipe(1, [1, 2])]);
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  const firstFilter = deferred<RecipeSummary[]>();
  const secondFilter = deferred<RecipeSummary[]>();
  app.getRecipes
    .mockReturnValueOnce(firstFilter.promise)
    .mockReturnValueOnce(secondFilter.promise);

  const firstReload = definition.onCycleIngredientFilter.call(
    instance,
    eventFor(1),
  );
  expect(instance.data.refreshing).toBe(true);
  expect(instance.data.featured?.id).toBe(1);
  const secondReload = definition.onCycleIngredientFilter.call(
    instance,
    eventFor(2),
  );

  secondFilter.resolve([recipe(22, [2])]);
  await secondReload;
  firstFilter.resolve([recipe(11, [1])]);
  await firstReload;

  expect(instance.data.featured?.id).toBe(22);
  expect(instance.data.refreshing).toBe(false);
});

test('ignores stale onShow inventory, recipe, and menu responses', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const oldInventory = deferred<InventoryItem[]>();
  const oldRecipes = deferred<RecipeSummary[]>();
  const oldMenu = deferred<TodayMenu>();
  const app = createAppMock();
  app.getInventory
    .mockReturnValueOnce(oldInventory.promise)
    .mockResolvedValueOnce([inventoryItem(20)]);
  app.getRecipes
    .mockReturnValueOnce(oldRecipes.promise)
    .mockResolvedValueOnce([recipe(20)]);
  app.getTodayMenu
    .mockReturnValueOnce(oldMenu.promise)
    .mockResolvedValueOnce(menu(20, [20]));
  runtime.getApp = () => app;

  const firstShow = definition.onShow.call(instance);
  await definition.onShow.call(instance);
  oldInventory.resolve([inventoryItem(10)]);
  oldRecipes.resolve([recipe(10)]);
  oldMenu.resolve(menu(10, [10]));
  await firstShow;

  expect(instance.data.inventory.map((item) => item.ingredientId)).toEqual([
    20,
  ]);
  expect(instance.data.featured?.id).toBe(20);
  expect(instance.data.menuVersion).toBe(20);
  expect(instance.data.mySelectedRecipeIds).toEqual([20]);
});

test.each(['old-first', 'new-first'] as const)(
  'resets to version zero at the 04:00 business-day rollover when %s responses arrive',
  async (resolutionOrder) => {
    const definition = await loadRecipePage();
    const instance = createInstance(definition);
    const oldMenu = menu(12, [2], { id: 31, menuDate: '2026-07-15' });
    const newMenu = menu(0, [], { id: 32, menuDate: '2026-07-16' });

    if (resolutionOrder === 'old-first') {
      definition.applyMenu.call(instance, oldMenu);
      definition.applyMenu.call(instance, newMenu);
    } else {
      definition.applyMenu.call(instance, newMenu);
      definition.applyMenu.call(instance, oldMenu);
    }

    expect(instance.data).toEqual(
      expect.objectContaining({
        menuId: 32,
        menuDate: '2026-07-16',
        menuVersion: 0,
        mySelectedRecipeIds: [],
      }),
    );
  },
);

test('keeps a partial load error visible with a retry after recipes succeed', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getInventory.mockRejectedValueOnce(new Error('inventory unavailable'));
  app.getRecipes.mockResolvedValue([recipe(3)]);
  runtime.getApp = () => app;

  await definition.onShow.call(instance);

  expect(instance.data.featured?.id).toBe(3);
  expect(instance.data.loadErrorMessage).toBe('暂时加载失败，请稍后重试');
  expect(readProjectFile('miniprogram/pages/recipes/index.wxml')).toContain(
    'wx:if="{{loadErrorMessage}}"',
  );
});

test.each(['inventory', 'menu'] as const)(
  'renders a successful empty recipe result with a partial %s error',
  async (failedRequest) => {
    const definition = await loadRecipePage();
    const instance = createInstance(definition);
    const app = createAppMock();
    app.getRecipes.mockResolvedValue([]);
    if (failedRequest === 'inventory') {
      app.getInventory.mockRejectedValueOnce(
        new Error('inventory unavailable'),
      );
    } else {
      app.getTodayMenu.mockRejectedValueOnce(new Error('menu unavailable'));
    }
    runtime.getApp = () => app;

    await definition.onShow.call(instance);

    expect(instance.data.recipesLoaded).toBe(true);
    expect(instance.data.featured).toBeNull();
    expect(instance.data.rows).toEqual([]);
    expect(instance.data.loading).toBe(false);
    expect(instance.data.loadErrorMessage).toBe('暂时加载失败，请稍后重试');

    const wxml = readProjectFile('miniprogram/pages/recipes/index.wxml');
    expect(wxml).toContain('loadErrorMessage && !recipesLoaded');
    expect(wxml).toContain('recipesLoaded && !featured');
  },
);

test('retains a successful empty recipe result while onShow refreshes it', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getRecipes.mockResolvedValueOnce([]);
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  const refresh = deferred<RecipeSummary[]>();
  app.getRecipes.mockReturnValueOnce(refresh.promise);
  const revisiting = definition.onShow.call(instance);

  expect(instance.data.recipesLoaded).toBe(true);
  expect(instance.data.loading).toBe(false);
  expect(instance.data.refreshing).toBe(true);
  expect(instance.data.featured).toBeNull();
  expect(instance.data.rows).toEqual([]);

  refresh.resolve([]);
  await revisiting;
  expect(instance.data.recipesLoaded).toBe(true);
  expect(instance.data.refreshing).toBe(false);
});

test.each([
  { current: false, emitted: false },
  { current: true, emitted: true },
])(
  'uses switch detail value $emitted even when the model is already $current',
  async ({ current, emitted }) => {
    const definition = await loadRecipePage();
    const instance = createInstance(definition);
    const app = createAppMock();
    runtime.getApp = () => app;
    instance.setData({ onlyCookable: current });

    await definition.onToggleOnlyCookable.call(instance, switchEvent(emitted));

    expect(instance.data.onlyCookable).toBe(emitted);
    expect(app.getRecipes).toHaveBeenCalledWith({
      includeIngredientIds: [],
      excludeIngredientIds: [],
      onlyCookable: emitted,
    });
  },
);

test('adds by sorted union, guards duplicates, and exposes already-added state', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getRecipes.mockResolvedValue([recipe(4)]);
  app.getTodayMenu.mockResolvedValue(menu(5, [9, 2]));
  app.saveSelections.mockResolvedValue(menu(6, [2, 4, 9]));
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  await definition.onAddToTonight.call(instance, eventFor(4));

  expect(app.saveSelections).toHaveBeenCalledWith([2, 4, 9], 5);
  expect(instance.data.menuVersion).toBe(6);
  expect(instance.data.mySelectedRecipeIds).toEqual([2, 4, 9]);
  expect(instance.data.featured?.added).toBe(true);
  expect(runtime.wx?.showToast).toHaveBeenCalledWith({
    title: '已加入今晚菜单',
    icon: 'success',
  });

  await definition.onAddToTonight.call(instance, eventFor(4));
  expect(app.saveSelections).toHaveBeenCalledTimes(1);
  expect(instance.data.actionMessage).toBe('这道菜已经在今晚菜单里');
});

test('reloads after conflict, preserves the pending recipe, and requires retry', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const app = createAppMock();
  app.getRecipes.mockResolvedValue([recipe(4)]);
  app.getTodayMenu
    .mockResolvedValueOnce(menu(5, [2]))
    .mockResolvedValueOnce(menu(7, [2, 8]));
  app.saveSelections
    .mockRejectedValueOnce(
      new ApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已更新'),
    )
    .mockResolvedValueOnce(menu(8, [2, 4, 8]));
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  await definition.onAddToTonight.call(instance, eventFor(4));

  expect(app.saveSelections).toHaveBeenCalledTimes(1);
  expect(instance.data.menuVersion).toBe(7);
  expect(instance.data.mySelectedRecipeIds).toEqual([2, 8]);
  expect(instance.data.pendingRecipeId).toBe(4);
  expect(instance.data.conflictMessage).toContain('重新');

  await definition.onAddToTonight.call(instance, eventFor(4));

  expect(app.saveSelections).toHaveBeenLastCalledWith([2, 4, 8], 7);
  expect(instance.data.menuVersion).toBe(8);
  expect(instance.data.pendingRecipeId).toBe(0);
});

test('refreshes recipes and menu without replay when a household recipe becomes invalid', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const householdRecipe: RecipeSummary = {
    ...recipe(14),
    scope: 'HOUSEHOLD',
    version: 8,
    defaultMethod: {
      id: 21,
      name: '家常做法',
      cookingStyle: '炒',
    },
  };
  const systemRecipe = recipe(1);
  const latestMenu = menu(7, [2, 8]);
  const app = createAppMock();
  app.getRecipes
    .mockResolvedValueOnce([householdRecipe])
    .mockResolvedValueOnce([systemRecipe]);
  app.getTodayMenu
    .mockResolvedValueOnce(menu(5, [2]))
    .mockResolvedValueOnce(latestMenu);
  app.saveSelections.mockRejectedValueOnce(
    new ApiError('DINNER_RECIPE_INVALID', 'invalid'),
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  instance.setData({ pendingRecipeId: 14 });

  await definition.onAddToTonight.call(instance, eventFor(14));

  expect(app.saveSelections).toHaveBeenCalledTimes(1);
  expect(app.getRecipes).toHaveBeenCalledTimes(2);
  expect(app.getRecipes).toHaveBeenLastCalledWith({
    includeIngredientIds: [],
    excludeIngredientIds: [],
    onlyCookable: false,
  });
  expect(app.getTodayMenu).toHaveBeenCalledTimes(2);
  expect(instance.data.featured?.id).toBe(1);
  expect(instance.data.menuVersion).toBe(7);
  expect(instance.data.mySelectedRecipeIds).toEqual([2, 8]);
  expect(instance.data.pendingRecipeId).toBe(0);
  expect(instance.data.conflictMessage).toBe('');
  expect(instance.data.actionMessage).toBe(
    '这道家庭菜谱已不可用，请刷新后重试',
  );
});

test('does not let a stale invalid-recipe refresh overwrite a newer page load', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const staleRecipes = deferred<RecipeSummary[]>();
  const staleMenu = deferred<TodayMenu>();
  const householdRecipe: RecipeSummary = {
    ...recipe(14),
    scope: 'HOUSEHOLD',
    version: 8,
    defaultMethod: {
      id: 21,
      name: '家常做法',
      cookingStyle: '炒',
    },
  };
  const app = createAppMock();
  app.getRecipes
    .mockResolvedValueOnce([householdRecipe])
    .mockReturnValueOnce(staleRecipes.promise)
    .mockResolvedValueOnce([recipe(20)]);
  app.getTodayMenu
    .mockResolvedValueOnce(menu(5, [2]))
    .mockReturnValueOnce(staleMenu.promise)
    .mockResolvedValueOnce(menu(8, [20]));
  app.saveSelections.mockRejectedValueOnce(
    new ApiError('DINNER_RECIPE_INVALID', 'invalid'),
  );
  runtime.getApp = () => app;
  await definition.onShow.call(instance);
  instance.setData({ pendingRecipeId: 14 });

  const recovering = definition.onAddToTonight.call(instance, eventFor(14));
  await Promise.resolve();
  await Promise.resolve();
  expect(app.getRecipes).toHaveBeenCalledTimes(2);
  expect(app.getTodayMenu).toHaveBeenCalledTimes(2);

  await definition.onShow.call(instance);
  staleRecipes.resolve([recipe(10)]);
  staleMenu.resolve(menu(7, [10]));
  await recovering;

  expect(instance.data.featured?.id).toBe(20);
  expect(instance.data.menuVersion).toBe(8);
  expect(instance.data.mySelectedRecipeIds).toEqual([20]);
  expect(instance.data.pendingRecipeId).toBe(0);
  expect(instance.data.actionMessage).toBe('');
});

test.each(['save-first', 'rollover-first'] as const)(
  'does not let an old-day save overwrite the 04:00 rollover when %s',
  async (resolutionOrder) => {
    const definition = await loadRecipePage();
    const instance = createInstance(definition);
    const saveRequest = deferred<TodayMenu>();
    const rolloverRequest = deferred<TodayMenu>();
    const app = createAppMock();
    const oldIdentity = { id: 31, menuDate: '2026-07-15' };
    const newIdentity = { id: 32, menuDate: '2026-07-16' };
    app.getRecipes.mockResolvedValue([recipe(4)]);
    app.getTodayMenu
      .mockResolvedValueOnce(menu(8, [2], oldIdentity))
      .mockReturnValueOnce(rolloverRequest.promise);
    app.saveSelections.mockReturnValue(saveRequest.promise);
    runtime.getApp = () => app;
    await definition.onShow.call(instance);

    const saving = definition.onAddToTonight.call(instance, eventFor(4));
    const rollingOver = definition.onShow.call(instance);
    if (resolutionOrder === 'save-first') {
      saveRequest.resolve(menu(9, [2, 4], oldIdentity));
      await saving;
      rolloverRequest.resolve(menu(0, [], newIdentity));
      await rollingOver;
    } else {
      rolloverRequest.resolve(menu(0, [], newIdentity));
      await rollingOver;
      saveRequest.resolve(menu(9, [2, 4], oldIdentity));
      await saving;
    }

    expect(instance.data).toEqual(
      expect.objectContaining({
        menuId: 32,
        menuDate: '2026-07-16',
        menuVersion: 0,
        mySelectedRecipeIds: [],
        savingRecipeId: 0,
      }),
    );
  },
);

test('recovers a save conflict onto the new business day and explicitly retries version zero', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const app = createAppMock();
  const oldIdentity = { id: 31, menuDate: '2026-07-15' };
  const newIdentity = { id: 32, menuDate: '2026-07-16' };
  app.getRecipes.mockResolvedValue([recipe(4)]);
  app.getTodayMenu
    .mockResolvedValueOnce(menu(8, [2], oldIdentity))
    .mockResolvedValueOnce(menu(0, [], newIdentity));
  app.saveSelections
    .mockRejectedValueOnce(
      new ApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已跨日更新'),
    )
    .mockResolvedValueOnce(menu(1, [4], newIdentity));
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  await definition.onAddToTonight.call(instance, eventFor(4));

  expect(instance.data).toEqual(
    expect.objectContaining({
      menuId: 32,
      menuDate: '2026-07-16',
      menuVersion: 0,
      mySelectedRecipeIds: [],
      pendingRecipeId: 4,
    }),
  );

  await definition.onAddToTonight.call(instance, eventFor(4));

  expect(app.saveSelections).toHaveBeenLastCalledWith([4], 0);
  expect(instance.data.menuVersion).toBe(1);
  expect(instance.data.pendingRecipeId).toBe(0);
});

test('does not let an older conflict reload regress a newer successful menu', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);
  const conflictReload = deferred<TodayMenu>();
  const app = createAppMock();
  app.getRecipes.mockResolvedValue([recipe(4)]);
  app.getTodayMenu
    .mockResolvedValueOnce(menu(5, [2]))
    .mockReturnValueOnce(conflictReload.promise);
  app.saveSelections.mockResolvedValue(menu(8, [2, 4]));
  runtime.getApp = () => app;
  await definition.onShow.call(instance);

  const recovery = definition.recoverMenuConflict.call(instance, 4);
  await definition.onAddToTonight.call(instance, eventFor(4));
  conflictReload.resolve(menu(7, [2, 8]));
  await recovery;

  expect(instance.data.menuVersion).toBe(8);
  expect(instance.data.mySelectedRecipeIds).toEqual([2, 4]);
  expect(instance.data.featured?.added).toBe(true);
  expect(instance.data.pendingRecipeId).toBe(0);
});

test.each([
  {
    label: 'the newer read resolves first',
    resolutionOrder: 'read-first',
    readMenu: menu(7, [2, 9]),
    saveMenu: menu(6, [2, 4]),
    expectedIds: [2, 9],
  },
  {
    label: 'the newer read resolves last',
    resolutionOrder: 'save-first',
    readMenu: menu(7, [2, 9]),
    saveMenu: menu(6, [2, 4]),
    expectedIds: [2, 9],
  },
  {
    label: 'the newer save resolves first',
    resolutionOrder: 'save-first',
    readMenu: menu(6, [2, 9]),
    saveMenu: menu(7, [2, 4]),
    expectedIds: [2, 4],
  },
  {
    label: 'the newer save resolves last',
    resolutionOrder: 'read-first',
    readMenu: menu(6, [2, 9]),
    saveMenu: menu(7, [2, 4]),
    expectedIds: [2, 4],
  },
] as const)(
  'clears a pending save across onShow when $label',
  async ({ resolutionOrder, readMenu, saveMenu, expectedIds }) => {
    const definition = await loadRecipePage();
    const instance = createInstance(definition);
    const saveRequest = deferred<TodayMenu>();
    const readRequest = deferred<TodayMenu>();
    const app = createAppMock();
    app.getRecipes.mockResolvedValue([recipe(4), recipe(6)]);
    app.getTodayMenu
      .mockResolvedValueOnce(menu(5, [2]))
      .mockReturnValueOnce(readRequest.promise);
    app.saveSelections
      .mockReturnValueOnce(saveRequest.promise)
      .mockResolvedValueOnce(menu(10));
    runtime.getApp = () => app;
    await definition.onShow.call(instance);

    const saving = definition.onAddToTonight.call(instance, eventFor(4));
    const revisiting = definition.onShow.call(instance);
    if (resolutionOrder === 'read-first') {
      readRequest.resolve(readMenu);
      await revisiting;
      saveRequest.resolve(saveMenu);
      await saving;
    } else {
      saveRequest.resolve(saveMenu);
      await saving;
      readRequest.resolve(readMenu);
      await revisiting;
    }

    expect(instance.data.savingRecipeId).toBe(0);
    expect(instance.data.menuVersion).toBe(7);
    expect(instance.data.mySelectedRecipeIds).toEqual(expectedIds);

    await definition.onAddToTonight.call(instance, eventFor(6));
    expect(app.saveSelections).toHaveBeenLastCalledWith(
      [...expectedIds, 6].sort((left, right) => left - right),
      7,
    );
    expect(instance.data.savingRecipeId).toBe(0);
    expect(instance.data.menuVersion).toBe(10);
  },
);

test.each([
  {
    label: 'the newer read resolves first',
    resolutionOrder: 'read-first',
    readMenu: menu(8, [2, 9]),
    recoveryMenu: menu(7, [2, 8]),
    expectedIds: [2, 9],
  },
  {
    label: 'the newer read resolves last',
    resolutionOrder: 'recovery-first',
    readMenu: menu(8, [2, 9]),
    recoveryMenu: menu(7, [2, 8]),
    expectedIds: [2, 9],
  },
  {
    label: 'the newer recovery resolves first',
    resolutionOrder: 'recovery-first',
    readMenu: menu(7, [2, 9]),
    recoveryMenu: menu(8, [2, 8]),
    expectedIds: [2, 8],
  },
  {
    label: 'the newer recovery resolves last',
    resolutionOrder: 'read-first',
    readMenu: menu(7, [2, 9]),
    recoveryMenu: menu(8, [2, 8]),
    expectedIds: [2, 8],
  },
] as const)(
  'keeps conflict recovery usable across onShow when $label',
  async ({ resolutionOrder, readMenu, recoveryMenu, expectedIds }) => {
    const definition = await loadRecipePage();
    const instance = createInstance(definition);
    const recoveryRequest = deferred<TodayMenu>();
    const readRequest = deferred<TodayMenu>();
    const app = createAppMock();
    app.getRecipes.mockResolvedValue([recipe(4)]);
    app.getTodayMenu
      .mockResolvedValueOnce(menu(5, [2]))
      .mockReturnValueOnce(recoveryRequest.promise)
      .mockReturnValueOnce(readRequest.promise);
    app.saveSelections
      .mockRejectedValueOnce(
        new ApiError('DINNER_MENU_VERSION_CONFLICT', '菜单已更新'),
      )
      .mockResolvedValueOnce(menu(10));
    runtime.getApp = () => app;
    await definition.onShow.call(instance);

    const recovering = definition.onAddToTonight.call(instance, eventFor(4));
    await Promise.resolve();
    await Promise.resolve();
    expect(app.getTodayMenu).toHaveBeenCalledTimes(2);
    const revisiting = definition.onShow.call(instance);

    if (resolutionOrder === 'read-first') {
      readRequest.resolve(readMenu);
      await revisiting;
      recoveryRequest.resolve(recoveryMenu);
      await recovering;
    } else {
      recoveryRequest.resolve(recoveryMenu);
      await recovering;
      readRequest.resolve(readMenu);
      await revisiting;
    }

    expect(instance.data.savingRecipeId).toBe(0);
    expect(instance.data.pendingRecipeId).toBe(4);
    expect(instance.data.menuVersion).toBe(8);
    expect(instance.data.mySelectedRecipeIds).toEqual(expectedIds);

    await definition.onAddToTonight.call(instance, eventFor(4));
    expect(app.saveSelections).toHaveBeenLastCalledWith(
      [...expectedIds, 4].sort((left, right) => left - right),
      8,
    );
    expect(instance.data.savingRecipeId).toBe(0);
    expect(instance.data.pendingRecipeId).toBe(0);
    expect(instance.data.menuVersion).toBe(10);
  },
);

test('opens inventory and the household recipe list', async () => {
  const definition = await loadRecipePage();
  const instance = createInstance(definition);

  definition.onOpenIngredients.call(instance);
  definition.onOpenHouseholdRecipes.call(instance);

  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith({
    url: '/pages/ingredients/index',
  });
  expect(runtime.wx?.navigateTo).toHaveBeenCalledWith({
    url: '/pages/family-recipes/index',
  });
  expect(runtime.wx?.showToast).not.toHaveBeenCalledWith(
    expect.objectContaining({ title: '家庭菜谱暂未开放' }),
  );
});
