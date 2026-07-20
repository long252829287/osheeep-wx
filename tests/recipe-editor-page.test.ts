import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from '../miniprogram/services/request';
import type { Ingredient } from '../miniprogram/types/ingredient';
import type {
  RecipeBasicInfoInput,
  RecipeDefaultMethodInput,
  RecipeDraft,
  RecipeImageAsset,
  RecipeIngredientsInput,
  RecipeStep,
} from '../miniprogram/types/recipe';
import type { RecipeAutosaveState } from '../miniprogram/utils/recipe-autosave';
import type { RecipePublishIssue } from '../miniprogram/utils/recipe-form';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string): string => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

interface EditorIngredient {
  ingredientId: number;
  name: string;
  quantityInput: string;
  unit: string;
  required: boolean;
}

interface EditorPageData {
  loading: boolean;
  loadErrorMessage: string;
  recipeId: number;
  version: number;
  activeStep: RecipeStep;
  nameInput: string;
  categoryInput: string;
  flavorInput: string;
  servingsInput: string;
  estimatedMinutesInput: string;
  editorIngredients: EditorIngredient[];
  ingredientCatalog: Ingredient[];
  ingredientLimitMessage: string;
  methodNameInput: string;
  cookingStyleInput: string;
  methodSteps: string[];
  selectedImage: RecipeImageAsset | null;
  draft: RecipeDraft | null;
  saveState: RecipeAutosaveState;
  saveMessage: string;
  fieldErrors: Record<string, string>;
  publishIssues: RecipePublishIssue[];
  publishing: boolean;
  navigationPending: boolean;
  refreshPending: boolean;
  publishErrorMessage: string;
  redirectRetryAvailable: boolean;
  publishConflictRecoveryAvailable: boolean;
  readOnly: boolean;
}

interface ValueEvent {
  detail: { value: string };
  currentTarget: {
    dataset: {
      field?: string;
      id?: number | string;
      index?: number | string;
    };
  };
}

interface TouchEvent {
  currentTarget: {
    dataset: {
      id?: number | string;
      index?: number | string;
      step?: string;
      ingredient?: Ingredient;
      name?: string;
      unit?: string;
    };
  };
}

interface EditorPageInstance {
  data: EditorPageData;
  setData(update: Partial<EditorPageData>, callback?: () => void): void;
  onLoad(query: { id?: string }): Promise<void>;
  onShow(): void;
  onRetryLoad(): Promise<void>;
  onHide(): void;
  onUnload(): void;
  onBasicInput(event: ValueEvent): void;
  onAddIngredient(event: TouchEvent): void;
  onIngredientQuantityInput(event: ValueEvent): void;
  onIngredientUnitInput(event: ValueEvent): void;
  onToggleIngredientRequired(event: TouchEvent): void;
  onRemoveIngredient(event: TouchEvent): void;
  currentIngredientPayload(): RecipeIngredientsInput['ingredients'];
  onMethodNameInput(event: ValueEvent): void;
  onCookingStyleInput(event: ValueEvent): void;
  onMethodStepInput(event: ValueEvent): void;
  onAddMethodStep(): void;
  onMoveStepUp(event: TouchEvent): void;
  onMoveStepDown(event: TouchEvent): void;
  onRemoveMethodStep(event: TouchEvent): void;
  onChooseImage(): void;
  onNextStep(): Promise<void>;
  onPreviousStep(): Promise<void>;
  onSelectStep(event: TouchEvent): Promise<void>;
  onRetrySave(): Promise<void>;
  onRetryRedirect(): Promise<void>;
  onRefreshPublishConflict(): Promise<void>;
  onPublish(): Promise<void>;
  onJumpToIssue(event: TouchEvent): Promise<void>;
}

interface EditorPageDefinition extends EditorPageInstance {
  data: EditorPageData;
}

interface AppMock {
  getIngredients: jest.Mock<Promise<Ingredient[]>, []>;
  getRecipeDraft: jest.Mock<Promise<RecipeDraft>, [number]>;
  saveRecipeBasicInfo: jest.Mock<
    Promise<RecipeDraft>,
    [number, RecipeBasicInfoInput]
  >;
  saveRecipeIngredients: jest.Mock<
    Promise<RecipeDraft>,
    [number, RecipeIngredientsInput]
  >;
  saveRecipeDefaultMethod: jest.Mock<
    Promise<RecipeDraft>,
    [number, RecipeDefaultMethodInput]
  >;
  saveRecipeImage: jest.Mock<
    Promise<RecipeDraft>,
    [number, number, number | null]
  >;
  publishRecipe: jest.Mock<Promise<RecipeDraft>, [number, number]>;
}

interface NavigateToOptions {
  url: string;
  events?: { imageSelected?: (image: RecipeImageAsset) => void };
  success?: () => void;
  fail?: () => void;
}

interface NavigateBackOptions {
  delta: number;
  success?: () => void;
  fail?: () => void;
}

interface RedirectToOptions {
  url: string;
  success?: () => void;
  fail?: () => void;
}

interface WxMock {
  navigateTo: jest.Mock<void, [NavigateToOptions]>;
  navigateBack: jest.Mock<void, [NavigateBackOptions]>;
  redirectTo: jest.Mock<void, [RedirectToOptions]>;
}

const runtime = globalThis as unknown as {
  Page?: (definition: EditorPageDefinition) => void;
  getApp?: () => AppMock;
  wx?: WxMock;
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;
const pageInstances: EditorPageInstance[] = [];

const approvedImage = (id: number): RecipeImageAsset => ({
  id,
  displayName: `已审核图片 ${id}`,
  listUrl: `/media/recipes/${String(id)}-list.webp`,
  detailUrl: `/media/recipes/${String(id)}-detail.webp`,
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Tomato_with_egg.jpg',
  author: 'Kaap bij Sneeuw',
  licenseName: 'CC0 1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  acquiredOn: '2026-07-16',
  width: 640,
  height: 480,
});

const completeDraft = (id = 9, version = 1): RecipeDraft => ({
  id,
  status: 'DRAFT',
  version,
  name: '番茄炒蛋',
  category: '家常菜',
  flavor: '酸甜',
  servings: 2,
  estimatedMinutes: 15,
  ingredients: [
    {
      ingredientId: 1,
      name: '番茄',
      quantity: 2,
      unit: '个',
      required: true,
      sortOrder: 0,
    },
  ],
  defaultMethod: {
    id: 3,
    name: '家常做法',
    cookingStyle: '炒',
    steps: [
      { instruction: '切番茄', sortOrder: 0 },
      { instruction: '炒鸡蛋', sortOrder: 1 },
    ],
  },
  image: approvedImage(4),
  incompleteSteps: [],
  updatedAt: '2026-07-20T08:00:00Z',
});

const incompleteDraft = (id = 9, version = 1): RecipeDraft => ({
  ...completeDraft(id, version),
  name: null,
  category: null,
  flavor: null,
  servings: null,
  estimatedMinutes: null,
  ingredients: [],
  defaultMethod: null,
  image: null,
  incompleteSteps: ['BASIC', 'INGREDIENTS', 'METHOD', 'IMAGE', 'PREVIEW'],
});

const ingredientCatalog: Ingredient[] = [
  { id: 1, name: '番茄', category: '蔬菜', defaultUnit: '个' },
  { id: 2, name: '盐', category: '调味料', defaultUnit: '克' },
];

const createAppMock = (): AppMock => ({
  getIngredients: jest
    .fn<Promise<Ingredient[]>, []>()
    .mockResolvedValue(ingredientCatalog),
  getRecipeDraft: jest
    .fn<Promise<RecipeDraft>, [number]>()
    .mockResolvedValue(completeDraft()),
  saveRecipeBasicInfo: jest
    .fn<Promise<RecipeDraft>, [number, RecipeBasicInfoInput]>()
    .mockImplementation((id, input) =>
      Promise.resolve({
        ...completeDraft(id, input.version + 1),
        name: input.name ?? null,
        category: input.category ?? null,
        flavor: input.flavor ?? null,
        servings: input.servings ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
      }),
    ),
  saveRecipeIngredients: jest
    .fn<Promise<RecipeDraft>, [number, RecipeIngredientsInput]>()
    .mockImplementation((id, input) =>
      Promise.resolve({
        ...completeDraft(id, input.version + 1),
        ingredients: input.ingredients.map((ingredient, index) => ({
          ...ingredient,
          name:
            ingredientCatalog.find(
              (candidate) => candidate.id === ingredient.ingredientId,
            )?.name ?? null,
          sortOrder: index,
        })),
      }),
    ),
  saveRecipeDefaultMethod: jest
    .fn<Promise<RecipeDraft>, [number, RecipeDefaultMethodInput]>()
    .mockImplementation((id, input) =>
      Promise.resolve({
        ...completeDraft(id, input.version + 1),
        defaultMethod: {
          id: 3,
          name: input.name ?? null,
          cookingStyle: input.cookingStyle ?? null,
          steps: input.steps.map((step, index) => ({
            instruction: step.instruction,
            sortOrder: index,
          })),
        },
      }),
    ),
  saveRecipeImage: jest
    .fn<Promise<RecipeDraft>, [number, number, number | null]>()
    .mockImplementation((id, version, imageAssetId) =>
      Promise.resolve({
        ...completeDraft(id, version + 1),
        image: imageAssetId === null ? null : approvedImage(imageAssetId),
      }),
    ),
  publishRecipe: jest
    .fn<Promise<RecipeDraft>, [number, number]>()
    .mockImplementation((id, version) =>
      Promise.resolve({
        ...completeDraft(id, version + 1),
        status: 'PUBLISHED',
      }),
    ),
});

const loadEditorPage = async (): Promise<EditorPageDefinition> => {
  const previousPage = runtime.Page;
  let captured: EditorPageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };
  try {
    await jest.isolateModulesAsync(async () => {
      await import('../miniprogram/pages/recipe-editor/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }
  if (!captured) throw new Error('Recipe editor Page was not captured');
  return captured;
};

const createPageInstance = (
  definition: EditorPageDefinition,
): EditorPageInstance => {
  const page: EditorPageInstance = {
    ...definition,
    data: {
      ...definition.data,
      editorIngredients: [...definition.data.editorIngredients],
      ingredientCatalog: [...definition.data.ingredientCatalog],
      methodSteps: [...definition.data.methodSteps],
      fieldErrors: { ...definition.data.fieldErrors },
      publishIssues: [...definition.data.publishIssues],
    },
    setData(update: Partial<EditorPageData>, callback?: () => void) {
      Object.assign(this.data, update);
      callback?.();
    },
  };
  pageInstances.push(page);
  return page;
};

const inputEvent = (
  value: string,
  dataset: ValueEvent['currentTarget']['dataset'] = {},
): ValueEvent => ({ detail: { value }, currentTarget: { dataset } });

const touchEvent = (
  dataset: TouchEvent['currentTarget']['dataset'],
): TouchEvent => ({ currentTarget: { dataset } });

const deferred = <T>() => {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  pageInstances.length = 0;
  runtime.wx = {
    navigateTo: jest.fn<void, [NavigateToOptions]>((options) => {
      options.success?.();
    }),
    navigateBack: jest.fn<void, [NavigateBackOptions]>((options) => {
      options.success?.();
    }),
    redirectTo: jest.fn<void, [RedirectToOptions]>((options) => {
      options.success?.();
    }),
  };
});

afterEach(() => {
  for (const page of pageInstances) page.onUnload();
  jest.useRealTimers();
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('renders all required editor states with native navigation and approved tokens', () => {
  const config = readProjectFile('miniprogram/pages/recipe-editor/index.json');
  const wxml = readProjectFile('miniprogram/pages/recipe-editor/index.wxml');
  const wxss = readProjectFile('miniprogram/pages/recipe-editor/index.wxss');

  expect(config).toContain('"navigationBarTitleText": "编辑菜谱"');
  expect(config).toContain('"navigationBarBackgroundColor": "#FFFAF3"');
  for (const label of ['基本', '食材', '做法', '图片', '预览']) {
    expect(wxml).toContain(label);
  }
  for (const state of ['保存中', '已保存', '保存失败', '版本冲突']) {
    expect(wxml).toContain(state);
  }
  expect(wxml).toContain('bindtap="onRetryLoad"');
  expect(wxml).toContain('bindtap="onRetrySave"');
  expect(wxml).toContain('bindtap="onRetryRedirect"');
  expect(wxml).toContain('bindtap="onRefreshPublishConflict"');
  expect(wxml).toContain(
    'wx:if="{{publishErrorMessage || redirectRetryAvailable || publishConflictRecoveryAvailable}}"',
  );
  expect(wxml).toContain('bindtap="onAddIngredient"');
  expect(wxml).toContain('bindtap="onToggleIngredientRequired"');
  expect(wxml).toContain('bindtap="onRemoveIngredient"');
  expect(wxml).toContain('bindtap="onMoveStepUp"');
  expect(wxml).toContain('bindtap="onMoveStepDown"');
  expect(wxml).toContain('bindtap="onRemoveMethodStep"');
  expect(wxml).toContain('bindtap="onJumpToIssue"');
  expect(wxml).toContain('aria-role="alert"');
  expect(wxml).toContain('aria-live="polite"');
  expect(wxml).not.toMatch(/\srole="/);
  expect(wxml).not.toContain("fieldErrors['");
  expect(wxml).not.toContain('<bottom-nav');
  expect(wxml).not.toContain('navigation-back');
  expect(wxml).toMatch(
    /maxlength="40"[\s\S]*?aria-label="\u505a\u6cd5\u540d\u79f0"/,
  );
  expect(wxml).toMatch(
    /maxlength="32"[\s\S]*?aria-label="\u70f9\u996a\u65b9\u5f0f"/,
  );
  expect(wxml).toContain(
    'disabled="{{editorIngredients.length >= 50 || navigationPending || refreshPending || publishing}}"',
  );
  expect(wxml).toContain(
    'disabled="{{publishing || navigationPending || refreshPending}}"',
  );
  expect(wxml).toContain(
    'disabled="{{navigationPending || refreshPending || publishing}}"',
  );
  expect(wxml).toContain(
    "wx:if=\"{{saveState === 'error' || saveState === 'conflict'}}\"",
  );
  expect(wxml).toMatch(
    /disabled="{{publishing \|\| navigationPending \|\| refreshPending}}"[\s\S]*?bindtap="onRetrySave"/,
  );
  expect(wxss).toMatch(/\.page-shell\s*\{[^}]*padding:[^;]*38rpx/s);
  expect(wxss).toMatch(/\.action-bar\s*\{[^}]*position:\s*fixed;/s);
  expect(wxss).toContain('env(safe-area-inset-bottom)');
  for (const className of [
    'step-button',
    'action-button',
    'add-step-button',
    'row-action',
    'inline-retry',
    'catalog-add',
    'required-toggle',
    'choose-image-button',
    'issue-row',
    'retry-button',
  ]) {
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

test('loads a strict draft id and initializes editable values and shared version', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(completeDraft(9, 3));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());

  await page.onLoad({ id: '9' });

  expect(app.getRecipeDraft).toHaveBeenCalledWith(9);
  expect(page.data.recipeId).toBe(9);
  expect(page.data.version).toBe(3);
  expect(page.data.activeStep).toBe('BASIC');
  expect(page.data.nameInput).toBe('番茄炒蛋');
  expect(page.data.methodSteps).toEqual(['切番茄', '炒鸡蛋']);
  expect(page.data.saveState).toBe('saved');
  expect(page.data.loading).toBe(false);
});

test.each(['', '0', '-1', '1.5', '9x', '9007199254740992'])(
  'rejects invalid draft id %s without requesting the API',
  async (id) => {
    const app = createAppMock();
    runtime.getApp = () => app;
    const page = createPageInstance(await loadEditorPage());

    await page.onLoad({ id });

    expect(app.getRecipeDraft).not.toHaveBeenCalled();
    expect(page.data.loading).toBe(false);
    expect(page.data.loadErrorMessage).toBe('菜谱地址无效，请返回家庭菜谱重试');
  },
);

test('keeps load failure retryable and ignores a stale retry response', async () => {
  const first = deferred<RecipeDraft>();
  const second = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());

  const initial = page.onLoad({ id: '9' });
  const retry = page.onRetryLoad();
  second.resolve(completeDraft(9, 7));
  await retry;
  first.reject(new Error('late failure'));
  await initial;

  expect(page.data.version).toBe(7);
  expect(page.data.loadErrorMessage).toBe('');
  expect(page.data.loading).toBe(false);
});

test('next step waits for the current autosave before moving', async () => {
  const saved = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  app.saveRecipeBasicInfo.mockReturnValue(saved.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));

  const moving = page.onNextStep();
  await flushMicrotasks();
  expect(page.data.activeStep).toBe('BASIC');
  expect(page.data.navigationPending).toBe(true);
  saved.resolve({ ...incompleteDraft(9, 2), name: '本地菜名' });
  await moving;

  expect(page.data.activeStep).toBe('INGREDIENTS');
  expect(page.data.version).toBe(2);
});

test('all editable steps serialize against one shared server version', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });

  page.onBasicInput(inputEvent('番茄炒蛋', { field: 'name' }));
  await page.onNextStep();
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
  await page.onNextStep();
  page.onMethodStepInput(inputEvent('拌匀', { index: 0 }));
  await page.onNextStep();

  expect(app.saveRecipeBasicInfo).toHaveBeenCalledWith(
    9,
    expect.objectContaining({ version: 1, name: '番茄炒蛋' }),
  );
  expect(app.saveRecipeIngredients).toHaveBeenCalledWith(9, {
    version: 2,
    ingredients: [
      { ingredientId: 2, quantity: null, unit: '克', required: true },
    ],
  });
  expect(app.saveRecipeDefaultMethod).toHaveBeenCalledWith(
    9,
    expect.objectContaining({
      version: 3,
      steps: [{ instruction: '拌匀' }],
    }),
  );
  expect(page.data.version).toBe(4);
  expect(page.data.activeStep).toBe('IMAGE');
});

test('simultaneous step coordinators use one global write queue and dequeue with the latest version', async () => {
  const basicSave = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  app.saveRecipeBasicInfo.mockReturnValue(basicSave.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });

  page.onBasicInput(inputEvent('番茄炒蛋', { field: 'name' }));
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
  jest.advanceTimersByTime(800);
  await flushMicrotasks();

  expect(app.saveRecipeBasicInfo).toHaveBeenCalledWith(
    9,
    expect.objectContaining({ version: 1 }),
  );
  expect(app.saveRecipeIngredients).not.toHaveBeenCalled();

  basicSave.resolve({ ...incompleteDraft(9, 2), name: '番茄炒蛋' });
  await flushMicrotasks();
  await flushMicrotasks();

  expect(app.saveRecipeIngredients).toHaveBeenCalledWith(9, {
    version: 2,
    ingredients: [
      { ingredientId: 2, quantity: null, unit: '克', required: true },
    ],
  });
  await flushMicrotasks();
  expect(page.data.version).toBe(3);
});

test('a save response advances canonical data without overwriting newer local input', async () => {
  const firstSave = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  app.saveRecipeBasicInfo.mockReturnValueOnce(firstSave.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('第一次输入', { field: 'name' }));
  jest.advanceTimersByTime(800);
  await flushMicrotasks();

  page.onBasicInput(inputEvent('第二次输入', { field: 'name' }));
  firstSave.resolve({ ...incompleteDraft(9, 2), name: '第一次输入' });
  await flushMicrotasks();
  await flushMicrotasks();

  expect(page.data.nameInput).toBe('第二次输入');
  expect(page.data.draft?.name).toBe('第一次输入');
  expect(page.data.version).toBe(2);
});

test.each([
  [{ ...incompleteDraft(10, 2), name: '错误菜谱' }, 'mismatched recipe'],
  [{ ...incompleteDraft(9, 0), name: '低版本' }, 'lower version'],
  [{ ...incompleteDraft(9, 1), name: '相同版本' }, 'non-advancing version'],
])(
  'rejects %s save responses without rolling canonical state back',
  async (response) => {
    const app = createAppMock();
    app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
    app.saveRecipeBasicInfo.mockResolvedValue(response);
    runtime.getApp = () => app;
    const page = createPageInstance(await loadEditorPage());
    await page.onLoad({ id: '9' });
    page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));

    await page.onNextStep();

    expect(page.data.version).toBe(1);
    expect(page.data.nameInput).toBe('本地菜名');
    expect(page.data.saveState).toBe('error');
    expect(page.data.activeStep).toBe('BASIC');
  },
);

test('version conflict keeps local values and blocks navigation', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  app.saveRecipeBasicInfo.mockRejectedValue(
    new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));

  await page.onNextStep();

  expect(page.data.nameInput).toBe('本地菜名');
  expect(page.data.saveState).toBe('conflict');
  expect(page.data.saveMessage).toBe('版本冲突');
  expect(page.data.activeStep).toBe('BASIC');
});

test('losing edit access during autosave moves to a consistent read-only preview', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(completeDraft(9, 1));
  app.saveRecipeBasicInfo.mockRejectedValue(
    new ApiError('FORBIDDEN', '无权编辑'),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('无权写入', { field: 'name' }));

  await page.onNextStep();

  expect(page.data.readOnly).toBe(true);
  expect(page.data.activeStep).toBe('PREVIEW');
  expect(page.data.publishErrorMessage).toBe(
    '你已无权编辑这份菜谱，请返回家庭菜谱',
  );
});

test('conflict retry refreshes canonical version and preserves local values before retrying', async () => {
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(incompleteDraft(9, 1))
    .mockResolvedValueOnce({ ...incompleteDraft(9, 7), name: '远端菜名' });
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({ ...incompleteDraft(9, 8), name: '本地菜名' });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));
  await page.onNextStep();

  await page.onRetrySave();

  expect(app.getRecipeDraft).toHaveBeenCalledTimes(2);
  expect(app.saveRecipeBasicInfo).toHaveBeenNthCalledWith(
    2,
    9,
    expect.objectContaining({ version: 7, name: '本地菜名' }),
  );
  expect(page.data.nameInput).toBe('本地菜名');
  expect(page.data.version).toBe(8);
});

test('conflict refresh merges remote non-dirty ingredients before preview and explicit publish', async () => {
  const remoteIngredients = [
    {
      ingredientId: 2,
      name: '盐',
      quantity: 1,
      unit: '克',
      required: true,
      sortOrder: 0,
    },
  ];
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 1))
    .mockResolvedValueOnce({
      ...completeDraft(9, 7),
      name: '远端菜名',
      ingredients: remoteIngredients,
    });
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({
      ...completeDraft(9, 8),
      name: '本地菜名',
      ingredients: remoteIngredients,
    });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));
  await page.onNextStep();

  await page.onRetrySave();

  expect(page.data.nameInput).toBe('本地菜名');
  expect(page.data.editorIngredients).toEqual([
    expect.objectContaining({
      ingredientId: 2,
      name: '盐',
      quantityInput: '1',
    }),
  ]);
  expect(app.publishRecipe).not.toHaveBeenCalled();

  page.data.activeStep = 'PREVIEW';
  await page.onPublish();

  expect(app.publishRecipe).toHaveBeenCalledWith(9, 8);
});

test('conflict refresh preserves a separately dirty ingredient step and saves it before publish', async () => {
  const remoteIngredients = [
    {
      ingredientId: 2,
      name: '盐',
      quantity: 1,
      unit: '克',
      required: true,
      sortOrder: 0,
    },
  ];
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 1))
    .mockResolvedValueOnce({
      ...completeDraft(9, 7),
      ingredients: remoteIngredients,
    });
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({
      ...completeDraft(9, 8),
      name: '本地菜名',
      ingredients: remoteIngredients,
    });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));
  await page.onNextStep();
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));

  await page.onRetrySave();

  expect(
    page.data.editorIngredients.map(({ ingredientId }) => ingredientId),
  ).toEqual([1, 2]);
  expect(app.publishRecipe).not.toHaveBeenCalled();

  page.data.activeStep = 'PREVIEW';
  await page.onPublish();

  expect(app.saveRecipeIngredients).toHaveBeenCalledWith(9, {
    version: 8,
    ingredients: [
      { ingredientId: 1, quantity: 2, unit: '个', required: true },
      { ingredientId: 2, quantity: null, unit: '克', required: true },
    ],
  });
  expect(app.publishRecipe).toHaveBeenCalledWith(9, 9);
});

test('conflict retry refuses to reuse a non-advancing refreshed version', async () => {
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(incompleteDraft(9, 1))
    .mockResolvedValueOnce(incompleteDraft(9, 1));
  app.saveRecipeBasicInfo.mockRejectedValue(
    new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));
  await page.onNextStep();

  await page.onRetrySave();

  expect(app.getRecipeDraft).toHaveBeenCalledTimes(2);
  expect(app.saveRecipeBasicInfo).toHaveBeenCalledTimes(1);
  expect(page.data.version).toBe(1);
  expect(page.data.nameInput).toBe('本地菜名');
});

test('retry save cannot start conflict recovery while navigation owns the page', async () => {
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(incompleteDraft(9, 1))
    .mockResolvedValueOnce(incompleteDraft(9, 7));
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({ ...incompleteDraft(9, 8), name: '本地菜名' });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));
  await page.onNextStep();

  const moving = page.onNextStep();
  const retrying = page.onRetrySave();
  await Promise.all([moving, retrying]);

  expect(app.getRecipeDraft).toHaveBeenCalledTimes(1);
  expect(app.saveRecipeBasicInfo).toHaveBeenCalledTimes(1);
  expect(page.data.activeStep).toBe('BASIC');
});

test('double next shares one navigation guard and advances exactly one step', async () => {
  const saved = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  app.saveRecipeBasicInfo.mockReturnValue(saved.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('番茄炒蛋', { field: 'name' }));

  const first = page.onNextStep();
  const second = page.onNextStep();
  saved.resolve({ ...incompleteDraft(9, 2), name: '番茄炒蛋' });
  await Promise.all([first, second]);

  expect(app.saveRecipeBasicInfo).toHaveBeenCalledTimes(1);
  expect(page.data.activeStep).toBe('INGREDIENTS');
});

test('navigation pending rejects a same-tick mutation that missed validation and flush', async () => {
  const saved = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  app.saveRecipeBasicInfo.mockReturnValue(saved.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('已接受的菜名', { field: 'name' }));

  const moving = page.onNextStep();
  page.onBasicInput(inputEvent('菜'.repeat(41), { field: 'name' }));
  saved.resolve({ ...incompleteDraft(9, 2), name: '已接受的菜名' });
  await moving;

  expect(page.data.activeStep).toBe('INGREDIENTS');
  expect(page.data.nameInput).toBe('已接受的菜名');
  expect(page.data.fieldErrors.name).toBeUndefined();
  expect(app.saveRecipeBasicInfo).toHaveBeenCalledWith(
    9,
    expect.objectContaining({ name: '已接受的菜名' }),
  );
});

test('ordinary save failure retains input and can retry without duplicate snapshots', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ...incompleteDraft(9, 2), name: '本地菜名' });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));

  await page.onNextStep();
  expect(page.data.activeStep).toBe('BASIC');
  expect(page.data.saveState).toBe('error');
  expect(page.data.nameInput).toBe('本地菜名');

  await page.onRetrySave();
  expect(app.saveRecipeBasicInfo).toHaveBeenCalledTimes(2);
  expect(page.data.version).toBe(2);
  expect(page.data.saveState).toBe('saved');
});

test('another coordinator cannot hide the first failed step retry state', async () => {
  const ingredientSave = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ...incompleteDraft(9, 3), name: '本地菜名' });
  app.saveRecipeIngredients.mockReturnValueOnce(ingredientSave.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));
  await page.onNextStep();

  expect(page.data.saveState).toBe('error');
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
  expect(page.data.saveState).toBe('error');
  await jest.advanceTimersByTimeAsync(800);
  await flushMicrotasks();
  expect(page.data.saveState).toBe('error');

  ingredientSave.resolve({
    ...incompleteDraft(9, 2),
    ingredients: [
      {
        ingredientId: 2,
        name: '盐',
        quantity: null,
        unit: '克',
        required: true,
        sortOrder: 0,
      },
    ],
  });
  await flushMicrotasks();
  expect(page.data.saveState).toBe('error');

  await page.onRetrySave();

  expect(app.saveRecipeBasicInfo).toHaveBeenCalledTimes(2);
  expect(page.data.saveState).toBe('saved');
});

test('preview save failure retries the failed step before a later explicit publish', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(completeDraft(9, 1));
  app.saveRecipeIngredients
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      ...completeDraft(9, 2),
      ingredients: [
        {
          ...completeDraft().ingredients[0],
          quantity: 3,
        },
      ],
    });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';
  page.onIngredientQuantityInput(inputEvent('3', { id: 1 }));

  await page.onPublish();

  expect(page.data.saveState).toBe('error');
  expect(app.publishRecipe).not.toHaveBeenCalled();
  expect(app.saveRecipeIngredients).toHaveBeenCalledTimes(1);

  await page.onRetrySave();

  expect(app.saveRecipeIngredients).toHaveBeenCalledTimes(2);
  expect(page.data.saveState).toBe('saved');
  expect(app.publishRecipe).not.toHaveBeenCalled();

  await page.onPublish();

  expect(app.publishRecipe).toHaveBeenCalledWith(9, 2);
});

test('adds catalog ingredient, maps blank quantity to null, toggles and removes it', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });

  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
  page.onIngredientQuantityInput(inputEvent('', { id: 2 }));
  expect(page.currentIngredientPayload()).toEqual([
    { ingredientId: 2, quantity: null, unit: '克', required: true },
  ]);

  page.onToggleIngredientRequired(touchEvent({ id: 2 }));
  expect(page.currentIngredientPayload()[0].required).toBe(false);
  page.onRemoveIngredient(touchEvent({ id: 2 }));
  expect(page.currentIngredientPayload()).toEqual([]);
});

test.each(['-1', '1.2345', 'Infinity', 'abc'])(
  'invalid ingredient quantity %s stays raw, becomes an inline error and is not saved',
  async (quantity) => {
    const app = createAppMock();
    app.getRecipeDraft.mockResolvedValue(incompleteDraft());
    runtime.getApp = () => app;
    const page = createPageInstance(await loadEditorPage());
    await page.onLoad({ id: '9' });
    page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
    page.data.activeStep = 'INGREDIENTS';

    page.onIngredientQuantityInput(inputEvent(quantity, { id: 2 }));

    expect(page.data.editorIngredients[0].quantityInput).toBe(quantity);
    expect(page.data.fieldErrors['ingredients[0].quantity']).toBe(
      '食材数量格式不正确',
    );
    expect(() => page.currentIngredientPayload()).toThrow('食材数量格式不正确');
    await jest.advanceTimersByTimeAsync(800);
    expect(app.saveRecipeIngredients).not.toHaveBeenCalled();
    await page.onNextStep();
    expect(page.data.activeStep).toBe('INGREDIENTS');
  },
);

test('zero ingredient quantity stays zero instead of becoming blank or 适量', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));

  page.onIngredientQuantityInput(inputEvent('0', { id: 2 }));

  expect(page.currentIngredientPayload()[0].quantity).toBe(0);
});

test('deleting an earlier ingredient rebuilds indexed errors for the remaining rows', async () => {
  const app = createAppMock();
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'INGREDIENTS';
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
  page.onIngredientQuantityInput(inputEvent('abc', { id: 2 }));

  expect(page.data.fieldErrors['ingredients[1].quantity']).toBe(
    '食材数量格式不正确',
  );

  page.onRemoveIngredient(touchEvent({ id: 1 }));

  expect(page.data.fieldErrors['ingredients[0].quantity']).toBe(
    '食材数量格式不正确',
  );
  expect(page.data.fieldErrors['ingredients[1].quantity']).toBeUndefined();

  page.onIngredientQuantityInput(inputEvent('2', { id: 2 }));
  await page.onNextStep();

  expect(page.data.fieldErrors['ingredients[0].quantity']).toBeUndefined();
  expect(page.data.activeStep).toBe('METHOD');
});

test('caps ingredients at 50 and the 51st add schedules no request', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });

  for (let id = 1; id <= 50; id += 1) {
    page.onAddIngredient(
      touchEvent({ id, name: `食材${String(id)}`, unit: '克' }),
    );
  }
  await jest.advanceTimersByTimeAsync(800);
  await flushMicrotasks();
  expect(page.data.editorIngredients).toHaveLength(50);
  expect(page.data.ingredientLimitMessage).toBe('最多可添加50种食材');
  expect(app.saveRecipeIngredients).toHaveBeenCalledTimes(1);
  app.saveRecipeIngredients.mockClear();

  page.onAddIngredient(touchEvent({ id: 51, name: '食材51', unit: '克' }));
  await jest.advanceTimersByTimeAsync(800);

  expect(page.data.editorIngredients).toHaveLength(50);
  expect(page.data.ingredientLimitMessage).toBe('最多可添加50种食材');
  expect(app.saveRecipeIngredients).not.toHaveBeenCalled();
  page.data.activeStep = 'INGREDIENTS';
  await page.onNextStep();
  expect(page.data.activeStep).toBe('METHOD');
});

test('moves, adds and removes method steps without losing text', async () => {
  const app = createAppMock();
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.methodSteps = ['切番茄', '炒鸡蛋'];

  page.onMoveStepUp(touchEvent({ index: 1 }));
  expect(page.data.methodSteps).toEqual(['炒鸡蛋', '切番茄']);
  page.onMoveStepDown(touchEvent({ index: 0 }));
  expect(page.data.methodSteps).toEqual(['切番茄', '炒鸡蛋']);
  page.onAddMethodStep();
  expect(page.data.methodSteps).toEqual(['切番茄', '炒鸡蛋', '']);
  page.onRemoveMethodStep(touchEvent({ index: 1 }));
  expect(page.data.methodSteps).toEqual(['切番茄', '']);
});

test('method labels enforce client limits inline without autosaving or navigating', async () => {
  const app = createAppMock();
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'METHOD';

  page.onMethodNameInput(inputEvent('做'.repeat(41)));
  page.onCookingStyleInput(inputEvent('炒'.repeat(33)));
  page.onMethodStepInput(inputEvent('切'.repeat(161), { index: 0 }));
  await jest.advanceTimersByTimeAsync(800);

  expect(page.data.fieldErrors.methodName).toBe('做法名称最多填写40个字');
  expect(page.data.fieldErrors.cookingStyle).toBe('烹饪方式最多填写32个字');
  expect(page.data.fieldErrors['steps[0]']).toBe('每个步骤最多160个字');
  expect(app.saveRecipeDefaultMethod).not.toHaveBeenCalled();
  await page.onNextStep();
  expect(page.data.activeStep).toBe('METHOD');

  page.onMethodNameInput(inputEvent('做'.repeat(40)));
  page.onCookingStyleInput(inputEvent('炒'.repeat(32)));
  page.onMethodStepInput(inputEvent('切'.repeat(160), { index: 0 }));
  await page.onNextStep();

  expect(page.data.fieldErrors.methodName).toBeUndefined();
  expect(page.data.fieldErrors.cookingStyle).toBeUndefined();
  expect(app.saveRecipeDefaultMethod).toHaveBeenCalledWith(
    9,
    expect.objectContaining({
      name: '做'.repeat(40),
      cookingStyle: '炒'.repeat(32),
    }),
  );
  expect(page.data.activeStep).toBe('IMAGE');
});

test('image selection uses the exact opener event metadata and image save payload', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'IMAGE';

  page.onChooseImage();
  const navigation = runtime.wx?.navigateTo.mock.calls[0][0];
  expect(navigation?.url).toBe('/pages/recipe-images/index');
  navigation?.events?.imageSelected?.(approvedImage(6));
  await page.onNextStep();

  expect(page.data.selectedImage).toEqual(approvedImage(6));
  expect(app.saveRecipeImage).toHaveBeenCalledWith(9, 1, 6);
  expect(page.data.activeStep).toBe('PREVIEW');
});

test('preview maps exact local validation issues before calling publish', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(app.publishRecipe).not.toHaveBeenCalled();
  expect(page.data.publishIssues[0]).toEqual({
    step: 'BASIC',
    field: 'name',
    message: '请填写菜名',
  });
});

test('publish uses Task 7 validator messages for locally representable field errors', async () => {
  const app = createAppMock();
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('菜'.repeat(41), { field: 'name' }));
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(app.publishRecipe).not.toHaveBeenCalled();
  expect(page.data.publishIssues[0]).toEqual({
    step: 'BASIC',
    field: 'name',
    message: '请填写菜名',
  });
});

test('publish preserves the exact invalid quantity issue that cannot be represented as a number', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
  page.onIngredientQuantityInput(inputEvent('abc', { id: 2 }));
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(app.publishRecipe).not.toHaveBeenCalled();
  expect(page.data.publishIssues).toContainEqual({
    step: 'INGREDIENTS',
    field: 'ingredients[0].quantity',
    message: '食材数量格式不正确',
  });
  expect(
    page.data.publishIssues.findIndex(
      (issue) => issue.field === 'ingredients[0].quantity',
    ),
  ).toBeLessThan(
    page.data.publishIssues.findIndex(
      (issue) => issue.field === 'defaultMethod',
    ),
  );
});

test('blank nullable server draft hydrates safe empty editor controls', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue({
    ...incompleteDraft(),
    ingredients: null,
    incompleteSteps: null,
  } as unknown as RecipeDraft);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());

  await page.onLoad({ id: '9' });

  expect(page.data.nameInput).toBe('');
  expect(page.data.categoryInput).toBe('');
  expect(page.data.editorIngredients).toEqual([]);
  expect(page.data.methodSteps).toEqual([]);
  expect(page.data.selectedImage).toBeNull();
});

test.each(['PUBLISHED', 'ARCHIVED'] as const)(
  'opens %s detail read-only in preview without creating writes',
  async (status) => {
    const app = createAppMock();
    app.getRecipeDraft.mockResolvedValue({ ...completeDraft(), status });
    runtime.getApp = () => app;
    const page = createPageInstance(await loadEditorPage());

    await page.onLoad({ id: '9' });
    page.onBasicInput(inputEvent('不应写入', { field: 'name' }));
    await page.onPublish();
    await jest.advanceTimersByTimeAsync(800);

    expect(page.data.readOnly).toBe(true);
    expect(page.data.activeStep).toBe('PREVIEW');
    expect(app.saveRecipeBasicInfo).not.toHaveBeenCalled();
    expect(app.publishRecipe).not.toHaveBeenCalled();
  },
);

test('accepted mutations establish every autosave snapshot before deferred setData callbacks', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  const immediateSetData = page.setData.bind(page);
  const delayedCallbacks: Array<() => void> = [];
  page.setData = (update, callback) => {
    Object.assign(page.data, update);
    if (callback) delayedCallbacks.push(callback);
  };

  page.onBasicInput(inputEvent('番茄炒蛋', { field: 'name' }));
  page.onBasicInput(inputEvent('家常菜', { field: 'category' }));
  page.onBasicInput(inputEvent('酸甜', { field: 'flavor' }));
  page.onBasicInput(inputEvent('2', { field: 'servings' }));
  page.onBasicInput(inputEvent('15', { field: 'estimatedMinutes' }));
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[0] }));
  page.onMethodStepInput(inputEvent('切番茄', { index: 0 }));
  page.onChooseImage();
  runtime.wx?.navigateTo.mock.calls[0][0].events?.imageSelected?.(
    approvedImage(4),
  );
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(delayedCallbacks).toEqual([]);
  expect(app.saveRecipeBasicInfo.mock.calls[0][1].version).toBe(1);
  expect(app.saveRecipeIngredients.mock.calls[0][1].version).toBe(2);
  expect(app.saveRecipeDefaultMethod.mock.calls[0][1].version).toBe(3);
  expect(app.saveRecipeImage).toHaveBeenCalledWith(9, 4, 4);
  expect(app.publishRecipe).toHaveBeenCalledWith(9, 5);
  page.setData = immediateSetData;
});

test('publish flushes every pending step in version order then publishes once', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 5));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });

  page.onBasicInput(inputEvent('番茄炒蛋', { field: 'name' }));
  page.onBasicInput(inputEvent('家常菜', { field: 'category' }));
  page.onBasicInput(inputEvent('酸甜', { field: 'flavor' }));
  page.onBasicInput(inputEvent('2', { field: 'servings' }));
  page.onBasicInput(inputEvent('15', { field: 'estimatedMinutes' }));
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[0] }));
  page.data.methodSteps = ['切番茄'];
  page.onMethodStepInput(inputEvent('切番茄', { index: 0 }));
  page.onChooseImage();
  runtime.wx?.navigateTo.mock.calls[0][0].events?.imageSelected?.(
    approvedImage(4),
  );
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(app.saveRecipeBasicInfo.mock.calls[0][1].version).toBe(5);
  expect(app.saveRecipeIngredients.mock.calls[0][1].version).toBe(6);
  expect(app.saveRecipeDefaultMethod.mock.calls[0][1].version).toBe(7);
  expect(app.saveRecipeImage).toHaveBeenCalledWith(9, 8, 4);
  expect(app.publishRecipe).toHaveBeenCalledTimes(1);
  expect(app.publishRecipe).toHaveBeenCalledWith(9, 9);
  expect(runtime.wx?.redirectTo).toHaveBeenCalledWith(
    expect.objectContaining({
      url: '/pages/family-recipes/index?tab=PUBLISHED',
    }),
  );
});

test('double publish shares one operation and redirect failure retries only navigation', async () => {
  const published = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(completeDraft(9, 8));
  app.publishRecipe.mockReturnValue(published.promise);
  runtime.getApp = () => app;
  runtime.wx?.redirectTo.mockImplementationOnce((options) => {
    options.fail?.();
  });
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';

  const first = page.onPublish();
  const duplicate = page.onPublish();
  await flushMicrotasks();
  expect(app.publishRecipe).toHaveBeenCalledTimes(1);
  expect(app.publishRecipe).toHaveBeenCalledWith(9, 8);
  published.resolve({ ...completeDraft(9, 9), status: 'PUBLISHED' });
  await Promise.all([first, duplicate]);

  expect(page.data.publishErrorMessage).toBe(
    '菜谱已发布，暂时无法返回，请重试',
  );
  expect(page.data.redirectRetryAvailable).toBe(true);
  expect(page.data.readOnly).toBe(true);
  runtime.wx?.redirectTo.mockImplementationOnce((options) => {
    options.success?.();
  });
  await page.onRetryRedirect();

  expect(app.publishRecipe).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.redirectTo).toHaveBeenCalledTimes(2);
  expect(page.data.redirectRetryAvailable).toBe(false);
});

test('publish conflict refreshes non-dirty canonical controls without auto-publishing', async () => {
  const remoteDraft: RecipeDraft = {
    ...completeDraft(9, 9),
    name: '远端新菜名',
    ingredients: [
      {
        ingredientId: 2,
        name: '盐',
        quantity: 1,
        unit: '克',
        required: true,
        sortOrder: 0,
      },
    ],
  };
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 8))
    .mockResolvedValueOnce(remoteDraft);
  app.publishRecipe
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({
      ...remoteDraft,
      version: 10,
      status: 'PUBLISHED',
    });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(page.data.publishConflictRecoveryAvailable).toBe(true);
  expect(app.publishRecipe).toHaveBeenCalledTimes(1);
  expect(runtime.wx?.redirectTo).not.toHaveBeenCalled();

  await page.onRefreshPublishConflict();

  expect(page.data.version).toBe(9);
  expect(page.data.nameInput).toBe('远端新菜名');
  expect(page.data.editorIngredients).toEqual([
    expect.objectContaining({
      ingredientId: 2,
      name: '盐',
      quantityInput: '1',
    }),
  ]);
  expect(page.data.publishConflictRecoveryAvailable).toBe(false);
  expect(app.publishRecipe).toHaveBeenCalledTimes(1);

  await page.onPublish();

  expect(app.publishRecipe).toHaveBeenNthCalledWith(2, 9, 9);
  expect(runtime.wx?.redirectTo).toHaveBeenCalledTimes(1);
});

test('publish conflict recovery stays visible after leaving and returning to preview', async () => {
  const remoteDraft = completeDraft(9, 9);
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 8))
    .mockResolvedValueOnce(remoteDraft);
  app.publishRecipe
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({
      ...remoteDraft,
      version: 10,
      status: 'PUBLISHED',
    });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';
  await page.onPublish();

  await page.onPreviousStep();
  expect(page.data.activeStep).toBe('IMAGE');
  expect(page.data.publishErrorMessage).toBe('');
  expect(page.data.publishConflictRecoveryAvailable).toBe(true);
  await page.onNextStep();
  expect(page.data.activeStep).toBe('PREVIEW');
  expect(page.data.publishConflictRecoveryAvailable).toBe(true);

  await page.onRefreshPublishConflict();

  expect(app.publishRecipe).toHaveBeenCalledTimes(1);
  expect(page.data.publishConflictRecoveryAvailable).toBe(false);
  await page.onPublish();
  expect(app.publishRecipe).toHaveBeenNthCalledWith(2, 9, 9);
  expect(runtime.wx?.redirectTo).toHaveBeenCalledTimes(1);
});

test('mutation accepted before a conflict refresh is dirty even when its setData callback is delayed', async () => {
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 8))
    .mockResolvedValueOnce({
      ...completeDraft(9, 9),
      name: '远端最新菜名',
    });
  app.publishRecipe.mockRejectedValueOnce(
    new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';
  await page.onPublish();

  const immediateSetData = page.setData.bind(page);
  let delayedMutationCallback: (() => void) | undefined;
  page.setData = (update, callback) => {
    Object.assign(page.data, update);
    if (callback && update.nameInput !== undefined) {
      delayedMutationCallback = callback;
      return;
    }
    callback?.();
  };
  page.onBasicInput(inputEvent('刷新前的本地菜名', { field: 'name' }));

  await page.onRefreshPublishConflict();
  delayedMutationCallback?.();
  await jest.advanceTimersByTimeAsync(800);

  expect(delayedMutationCallback).toBeUndefined();
  expect(page.data.nameInput).toBe('刷新前的本地菜名');
  expect(app.saveRecipeBasicInfo).toHaveBeenCalledWith(
    9,
    expect.objectContaining({
      version: 9,
      name: '刷新前的本地菜名',
    }),
  );
  expect(app.publishRecipe).toHaveBeenCalledTimes(1);
  page.setData = immediateSetData;
});

test('publish conflict refresh locks delayed mutation callbacks until canonical merge completes', async () => {
  const remote = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 8))
    .mockReturnValueOnce(remote.promise);
  app.publishRecipe.mockRejectedValueOnce(
    new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';
  await page.onPublish();

  const immediateSetData = page.setData.bind(page);
  let delayedMutationCallback: (() => void) | undefined;
  page.setData = (update, callback) => {
    Object.assign(page.data, update);
    if (callback && update.nameInput !== undefined) {
      delayedMutationCallback = callback;
      return;
    }
    callback?.();
  };

  const refreshing = page.onRefreshPublishConflict();
  await flushMicrotasks();
  expect(page.data.refreshPending).toBe(true);

  page.onBasicInput(inputEvent('刷新中的迟到输入', { field: 'name' }));
  remote.resolve({ ...completeDraft(9, 9), name: '远端最新菜名' });
  await refreshing;

  delayedMutationCallback?.();
  await jest.advanceTimersByTimeAsync(800);
  expect(delayedMutationCallback).toBeUndefined();
  expect(page.data.refreshPending).toBe(false);
  expect(page.data.nameInput).toBe('远端最新菜名');
  expect(app.saveRecipeBasicInfo).not.toHaveBeenCalled();
  page.setData = immediateSetData;
});

test('publish conflict refresh losing access removes recovery and never fetches again', async () => {
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 8))
    .mockRejectedValueOnce(new ApiError('FORBIDDEN', '无权访问'));
  app.publishRecipe.mockRejectedValueOnce(
    new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';
  await page.onPublish();

  expect(page.data.publishConflictRecoveryAvailable).toBe(true);
  await page.onRefreshPublishConflict();

  expect(page.data.readOnly).toBe(true);
  expect(page.data.publishConflictRecoveryAvailable).toBe(false);
  expect(app.getRecipeDraft).toHaveBeenCalledTimes(2);
  await page.onRefreshPublishConflict();
  expect(app.getRecipeDraft).toHaveBeenCalledTimes(2);
});

test('publish conflict refresh to a non-draft removes recovery and never fetches again', async () => {
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 8))
    .mockResolvedValueOnce({
      ...completeDraft(9, 9),
      status: 'PUBLISHED',
    });
  app.publishRecipe.mockRejectedValueOnce(
    new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';
  await page.onPublish();

  await page.onRefreshPublishConflict();

  expect(page.data.readOnly).toBe(true);
  expect(page.data.activeStep).toBe('PREVIEW');
  expect(page.data.publishConflictRecoveryAvailable).toBe(false);
  expect(app.getRecipeDraft).toHaveBeenCalledTimes(2);
  await page.onRefreshPublishConflict();
  expect(app.getRecipeDraft).toHaveBeenCalledTimes(2);
});

test('same-tick previous then publish never publishes while navigation owns the page', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(completeDraft(9, 8));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';

  const moving = page.onPreviousStep();
  const publishing = page.onPublish();
  await Promise.all([moving, publishing]);

  expect(page.data.activeStep).toBe('IMAGE');
  expect(app.publishRecipe).not.toHaveBeenCalled();
});

test('retry save cannot start conflict recovery while publish owns the page', async () => {
  const app = createAppMock();
  app.getRecipeDraft
    .mockResolvedValueOnce(completeDraft(9, 1))
    .mockResolvedValueOnce(completeDraft(9, 7));
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(
      new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'),
    )
    .mockResolvedValueOnce({ ...completeDraft(9, 8), name: '本地菜名' });
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('本地菜名', { field: 'name' }));
  await page.onNextStep();
  page.data.activeStep = 'PREVIEW';

  const publishing = page.onPublish();
  const retrying = page.onRetrySave();
  await Promise.all([publishing, retrying]);

  expect(app.getRecipeDraft).toHaveBeenCalledTimes(1);
  expect(app.saveRecipeBasicInfo).toHaveBeenCalledTimes(1);
  expect(app.publishRecipe).not.toHaveBeenCalled();
});

test('publish lock ignores late mutation events after the flush has started', async () => {
  const published = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(completeDraft(9, 8));
  app.publishRecipe.mockReturnValue(published.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onChooseImage();
  const imageSelected =
    runtime.wx?.navigateTo.mock.calls[0][0].events?.imageSelected;
  page.data.activeStep = 'PREVIEW';

  const publishing = page.onPublish();
  await flushMicrotasks();
  expect(page.data.publishing).toBe(true);
  expect(app.publishRecipe).toHaveBeenCalledWith(9, 8);

  page.onBasicInput(inputEvent('迟到菜名', { field: 'name' }));
  page.onAddIngredient(touchEvent({ ingredient: ingredientCatalog[1] }));
  page.onMethodNameInput(inputEvent('迟到做法'));
  imageSelected?.(approvedImage(6));

  expect(page.data.nameInput).toBe('番茄炒蛋');
  expect(
    page.data.editorIngredients.map(({ ingredientId }) => ingredientId),
  ).toEqual([1]);
  expect(page.data.methodNameInput).toBe('家常做法');
  expect(page.data.selectedImage?.id).toBe(4);
  expect(app.saveRecipeBasicInfo).not.toHaveBeenCalled();
  expect(app.saveRecipeIngredients).not.toHaveBeenCalled();
  expect(app.saveRecipeDefaultMethod).not.toHaveBeenCalled();
  expect(app.saveRecipeImage).not.toHaveBeenCalled();

  published.resolve({ ...completeDraft(9, 9), status: 'PUBLISHED' });
  await publishing;
});

test('server validation details become exact jumpable issues', async () => {
  const issues: RecipePublishIssue[] = [
    { step: 'METHOD', field: 'steps[0]', message: '请填写做法步骤' },
  ];
  const app = createAppMock();
  app.publishRecipe.mockRejectedValue(
    new ApiError(
      'DINNER_RECIPE_VALIDATION_FAILED',
      '校验失败',
      undefined,
      issues,
    ),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(page.data.publishIssues).toEqual(issues);
  expect(page.data.publishErrorMessage).toBe('请按提示完善菜谱');
  await page.onJumpToIssue(touchEvent({ step: 'METHOD' }));
  expect(page.data.activeStep).toBe('METHOD');
});

test.each([
  ['DINNER_RECIPE_VALIDATION_FAILED', {}, '菜谱内容需要调整，请检查后重试'],
  ['FORBIDDEN', undefined, '你已无权编辑这份菜谱，请返回家庭菜谱'],
  ['DINNER_RECIPE_NOT_FOUND', undefined, '这份菜谱已不存在，请返回家庭菜谱'],
  ['NETWORK_ERROR', undefined, '网络异常，草稿已保留，请稍后重试'],
  ['SOMETHING_NEW', undefined, '发布失败，请稍后重试，草稿已保留'],
])('maps defensive publish failure %s', async (code, details, message) => {
  const app = createAppMock();
  app.publishRecipe.mockRejectedValue(
    new ApiError(code, code, undefined, details),
  );
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(page.data.publishErrorMessage).toBe(message);
  if (code === 'FORBIDDEN') {
    page.onBasicInput(inputEvent('禁止写入', { field: 'name' }));
    await jest.advanceTimersByTimeAsync(800);
    expect(app.saveRecipeBasicInfo).not.toHaveBeenCalled();
  }
});

test.each([
  ['DINNER_RECIPE_CONTENT_REJECTED', '内容没有通过安全检查，草稿已保留'],
  ['DINNER_RECIPE_MODERATION_UNAVAILABLE', '暂时无法完成安全检查，请稍后重试'],
  ['DINNER_RECIPE_IMAGE_INVALID', '这张图片已不可用，请重新选择'],
  ['DINNER_RECIPE_VERSION_CONFLICT', '草稿刚刚发生变化，请刷新后再发布'],
])('keeps the draft on publish error %s', async (code, message) => {
  const app = createAppMock();
  app.publishRecipe.mockRejectedValue(new ApiError(code, code));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.data.activeStep = 'PREVIEW';

  await page.onPublish();

  expect(page.data.publishErrorMessage).toBe(message);
  expect(page.data.draft).not.toBeNull();
  expect(runtime.wx?.redirectTo).not.toHaveBeenCalled();
});

test('onHide records flush failure and unload prevents late setData or navigation', async () => {
  const pending = deferred<RecipeDraft>();
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft());
  app.saveRecipeBasicInfo
    .mockRejectedValueOnce(new Error('offline'))
    .mockReturnValueOnce(pending.promise);
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('保留的本地值', { field: 'name' }));

  page.onHide();
  await flushMicrotasks();
  expect(page.data.saveState).toBe('error');
  expect(page.data.saveMessage).toBe('保存失败');

  const retry = page.onRetrySave();
  await flushMicrotasks();
  page.onUnload();
  const snapshot = JSON.stringify(page.data);
  pending.resolve({ ...incompleteDraft(9, 2), name: '迟到响应' });
  await retry;

  expect(JSON.stringify(page.data)).toBe(snapshot);
  expect(runtime.wx?.navigateBack).not.toHaveBeenCalled();
  expect(runtime.wx?.redirectTo).not.toHaveBeenCalled();
});

test('unload leaves no accepted mutation callback that can change data later', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  const immediateSetData = page.setData.bind(page);
  const delayedCallbacks: Array<() => void> = [];
  page.setData = (update, callback) => {
    Object.assign(page.data, update);
    if (callback) delayedCallbacks.push(callback);
  };
  page.onBasicInput(inputEvent('菜'.repeat(41), { field: 'name' }));

  page.onUnload();
  const snapshot = JSON.stringify(page.data);
  delayedCallbacks.forEach((callback) => callback());
  await jest.advanceTimersByTimeAsync(800);
  await flushMicrotasks();

  expect(delayedCallbacks).toEqual([]);
  expect(JSON.stringify(page.data)).toBe(snapshot);
  expect(app.saveRecipeBasicInfo).not.toHaveBeenCalled();
  expect(runtime.wx?.navigateBack).not.toHaveBeenCalled();
  expect(runtime.wx?.redirectTo).not.toHaveBeenCalled();
  page.setData = immediateSetData;
});

test('onUnload reuses the shared flush path before disposing without writing page data', async () => {
  const app = createAppMock();
  app.getRecipeDraft.mockResolvedValue(incompleteDraft(9, 1));
  runtime.getApp = () => app;
  const page = createPageInstance(await loadEditorPage());
  await page.onLoad({ id: '9' });
  page.onBasicInput(inputEvent('离开前保存', { field: 'name' }));
  const snapshot = JSON.stringify(page.data);

  page.onUnload();
  await flushMicrotasks();
  await flushMicrotasks();

  expect(app.saveRecipeBasicInfo).toHaveBeenCalledWith(
    9,
    expect.objectContaining({ version: 1, name: '离开前保存' }),
  );
  expect(JSON.stringify(page.data)).toBe(snapshot);
});
