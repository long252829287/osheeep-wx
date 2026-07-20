import { ApiError } from '../../services/request';
import type { Ingredient } from '../../types/ingredient';
import type {
  RecipeBasicInfoInput,
  RecipeDefaultMethodInput,
  RecipeDraft,
  RecipeImageAsset,
  RecipeIngredient,
  RecipeIngredientInput,
  RecipeIngredientsInput,
  RecipeStep,
} from '../../types/recipe';
import {
  createRecipeAutosave,
  type RecipeAutosave,
  type RecipeAutosaveState,
} from '../../utils/recipe-autosave';
import {
  parseRecipeQuantity,
  RecipeQuantityError,
  type RecipePublishIssue,
  validateRecipeForPublish,
} from '../../utils/recipe-form';

interface OsheeepApp {
  getIngredients: () => Promise<Ingredient[]>;
  getRecipeDraft: (id: number) => Promise<RecipeDraft>;
  saveRecipeBasicInfo: (
    id: number,
    input: RecipeBasicInfoInput,
  ) => Promise<RecipeDraft>;
  saveRecipeIngredients: (
    id: number,
    input: RecipeIngredientsInput,
  ) => Promise<RecipeDraft>;
  saveRecipeDefaultMethod: (
    id: number,
    input: RecipeDefaultMethodInput,
  ) => Promise<RecipeDraft>;
  saveRecipeImage: (
    id: number,
    version: number,
    imageAssetId: number | null,
  ) => Promise<RecipeDraft>;
  publishRecipe: (id: number, version: number) => Promise<RecipeDraft>;
}

type EditableRecipeStep = Exclude<RecipeStep, 'PREVIEW'>;
type BasicSnapshot = Omit<RecipeBasicInfoInput, 'version'>;
interface IngredientSnapshot {
  ingredients: RecipeIngredientInput[] | null;
}
type MethodSnapshot = Omit<RecipeDefaultMethodInput, 'version'>;
interface MethodSaveSnapshot {
  method: MethodSnapshot | null;
}

interface EditorIngredientRow {
  clientKey: string;
  ingredientId: number;
  name: string;
  quantityInput: string;
  unit: string;
  required: boolean;
  quantityError: string;
  unitError: string;
}

interface MethodStepRow {
  clientKey: string;
  instruction: string;
  index: number;
  errorMessage: string;
}

interface StepOption {
  key: RecipeStep;
  label: string;
}

interface EditorPageData {
  loading: boolean;
  loadErrorMessage: string;
  catalogErrorMessage: string;
  recipeId: number;
  version: number;
  activeStep: RecipeStep;
  stepOptions: StepOption[];
  nameInput: string;
  categoryInput: string;
  flavorInput: string;
  servingsInput: string;
  estimatedMinutesInput: string;
  editorIngredients: EditorIngredientRow[];
  ingredientCatalog: Ingredient[];
  ingredientLimitMessage: string;
  methodNameInput: string;
  cookingStyleInput: string;
  methodSteps: string[];
  methodStepKeys: string[];
  methodStepErrors: string[];
  methodStepRows: MethodStepRow[];
  methodConfigured: boolean;
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

interface EditorPageContext {
  data: EditorPageData;
  setData(update: Partial<EditorPageData>, callback?: () => void): void;
}

interface AutosaveBundle {
  BASIC: RecipeAutosave<BasicSnapshot>;
  INGREDIENTS: RecipeAutosave<IngredientSnapshot>;
  METHOD: RecipeAutosave<MethodSaveSnapshot>;
  IMAGE: RecipeAutosave<number | null>;
}

interface EditorRuntime {
  visible: boolean;
  destroyed: boolean;
  loadToken: number;
  serverVersion: number;
  autosaves: AutosaveBundle | null;
  writeTail: Promise<void>;
  navigationOperation: Promise<void> | null;
  publishOperation: Promise<void> | null;
  publishedDraft: RecipeDraft | null;
  pendingRedirect: boolean;
  controlledNavigation: boolean;
  writesDisabled: boolean;
  conflictedStep: EditableRecipeStep | null;
  failedStep: EditableRecipeStep | null;
  nextClientKey: number;
}

class EditorFieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'EditorFieldError';
  }
}

const STEPS: readonly RecipeStep[] = [
  'BASIC',
  'INGREDIENTS',
  'METHOD',
  'IMAGE',
  'PREVIEW',
];

const STEP_OPTIONS: StepOption[] = [
  { key: 'BASIC', label: '基本' },
  { key: 'INGREDIENTS', label: '食材' },
  { key: 'METHOD', label: '做法' },
  { key: 'IMAGE', label: '图片' },
  { key: 'PREVIEW', label: '预览' },
];

const pageRuntimes = new WeakMap<object, EditorRuntime>();

const runtimeFor = (page: object): EditorRuntime => {
  const existing = pageRuntimes.get(page);
  if (existing) return existing;
  const created: EditorRuntime = {
    visible: true,
    destroyed: false,
    loadToken: 0,
    serverVersion: 0,
    autosaves: null,
    writeTail: Promise.resolve(),
    navigationOperation: null,
    publishOperation: null,
    publishedDraft: null,
    pendingRedirect: false,
    controlledNavigation: false,
    writesDisabled: false,
    conflictedStep: null,
    failedStep: null,
    nextClientKey: 1,
  };
  pageRuntimes.set(page, created);
  return created;
};

const canSetData = (page: EditorPageContext): boolean =>
  !runtimeFor(page).destroyed;

const mutationIsLocked = (page: EditorPageContext): boolean => {
  const runtime = runtimeFor(page);
  return (
    page.data.readOnly ||
    runtime.writesDisabled ||
    page.data.publishing ||
    page.data.refreshPending
  );
};

const isEditableStep = (step: RecipeStep): step is EditableRecipeStep =>
  step !== 'PREVIEW';

const isRecipeStep = (value: unknown): value is RecipeStep =>
  typeof value === 'string' && STEPS.includes(value as RecipeStep);

const validDraftId = (value: string | undefined): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const errorCodeOf = (error: unknown): string | undefined => {
  if (error instanceof ApiError) return error.errorCode;
  if (
    typeof error === 'object' &&
    error !== null &&
    'errorCode' in error &&
    typeof error.errorCode === 'string'
  ) {
    return error.errorCode;
  }
  return undefined;
};

const accessWasLost = (error: unknown): boolean =>
  ['FORBIDDEN', 'UNAUTHORIZED', 'DINNER_RECIPE_NOT_FOUND'].includes(
    errorCodeOf(error) ?? '',
  );

const detailsOf = (error: unknown): unknown => {
  if (error instanceof ApiError) return error.details;
  if (typeof error === 'object' && error !== null && 'details' in error) {
    return error.details;
  }
  return undefined;
};

const normalizeAutosaveError = (error: unknown): unknown => {
  const errorCode = errorCodeOf(error);
  if (
    errorCode === 'DINNER_RECIPE_VERSION_CONFLICT' &&
    !(error instanceof ApiError)
  ) {
    return new ApiError(
      errorCode,
      error instanceof Error ? error.message : '草稿版本冲突',
      undefined,
      detailsOf(error),
    );
  }
  return error;
};

const saveMessageFor = (state: RecipeAutosaveState): string => {
  switch (state) {
    case 'saving':
      return '保存中';
    case 'saved':
      return '已保存';
    case 'error':
      return '保存失败';
    case 'conflict':
      return '版本冲突';
    case 'scheduled':
      return '等待保存';
    default:
      return '内容会自动保存';
  }
};

const setSaveState = (
  page: EditorPageContext,
  state: RecipeAutosaveState,
): void => {
  if (!canSetData(page)) return;
  page.setData({ saveState: state, saveMessage: saveMessageFor(state) });
};

const nextClientKey = (
  page: EditorPageContext,
  prefix: 'ingredient' | 'method',
): string => {
  const runtime = runtimeFor(page);
  const key = `${prefix}-${String(runtime.nextClientKey)}`;
  runtime.nextClientKey += 1;
  return key;
};

const methodRows = (
  steps: string[],
  keys: string[],
  errors: string[] = [],
): MethodStepRow[] =>
  steps.map((instruction, index) => ({
    clientKey: keys[index],
    instruction,
    index,
    errorMessage: errors[index] ?? '',
  }));

const ensureMethodKeys = (
  page: EditorPageContext,
  steps: string[],
  existing: string[] = page.data.methodStepKeys,
): string[] =>
  steps.map((_, index) => existing[index] ?? nextClientKey(page, 'method'));

const textOrNull = (value: string): string | null =>
  value.trim() ? value : null;

const optionalInteger = (
  value: string,
  field: 'servings' | 'estimatedMinutes',
): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new EditorFieldError(
      field,
      field === 'servings' ? '请输入1到20份' : '请输入1到1440分钟',
    );
  }
  const parsed = Number(trimmed);
  const maximum = field === 'servings' ? 20 : 1440;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new EditorFieldError(
      field,
      field === 'servings' ? '请输入1到20份' : '请输入1到1440分钟',
    );
  }
  return parsed;
};

const basicSnapshot = (page: EditorPageContext): BasicSnapshot => {
  const fields: Array<[string, string, number]> = [
    ['name', page.data.nameInput, 40],
    ['category', page.data.categoryInput, 16],
    ['flavor', page.data.flavorInput, 16],
  ];
  for (const [field, value, maximum] of fields) {
    if (value.length > maximum) {
      throw new EditorFieldError(field, `最多填写${String(maximum)}个字`);
    }
  }
  return {
    name: textOrNull(page.data.nameInput),
    category: textOrNull(page.data.categoryInput),
    flavor: textOrNull(page.data.flavorInput),
    servings: optionalInteger(page.data.servingsInput, 'servings'),
    estimatedMinutes: optionalInteger(
      page.data.estimatedMinutesInput,
      'estimatedMinutes',
    ),
  };
};

const ingredientPayload = (
  rows: EditorIngredientRow[],
): RecipeIngredientInput[] => {
  if (rows.length > 50) {
    throw new EditorFieldError('ingredients', '食材不能超过50种');
  }
  return rows.map((row, index) => {
    if (!Number.isSafeInteger(row.ingredientId) || row.ingredientId <= 0) {
      throw new EditorFieldError(
        `ingredients[${String(index)}].ingredientId`,
        '请选择有效食材',
      );
    }
    if (!row.unit.trim() || row.unit.length > 16) {
      throw new EditorFieldError(
        `ingredients[${String(index)}].unit`,
        '请填写食材单位',
      );
    }
    try {
      return {
        ingredientId: row.ingredientId,
        quantity: parseRecipeQuantity(row.quantityInput),
        unit: row.unit,
        required: row.required,
      };
    } catch (error) {
      if (error instanceof RecipeQuantityError) {
        throw new EditorFieldError(
          `ingredients[${String(index)}].quantity`,
          error.message,
        );
      }
      throw error;
    }
  });
};

const safeIngredientPayload = (
  rows: EditorIngredientRow[],
): RecipeIngredientInput[] | null => {
  try {
    return ingredientPayload(rows);
  } catch {
    return null;
  }
};

const methodSnapshot = (page: EditorPageContext): MethodSnapshot => {
  if (page.data.methodNameInput.length > 40) {
    throw new EditorFieldError('methodName', '做法名称最多填写40个字');
  }
  if (page.data.cookingStyleInput.length > 32) {
    throw new EditorFieldError('cookingStyle', '烹饪方式最多填写32个字');
  }
  const invalidStep = page.data.methodSteps.findIndex(
    (instruction) => instruction.length > 160,
  );
  if (invalidStep >= 0) {
    throw new EditorFieldError(
      `steps[${String(invalidStep)}]`,
      '每个步骤最多160个字',
    );
  }
  return {
    name: textOrNull(page.data.methodNameInput),
    cookingStyle: textOrNull(page.data.cookingStyleInput),
    steps: page.data.methodSteps.map((instruction) => ({
      instruction: textOrNull(instruction),
    })),
  };
};

const draftIngredients = (rows: EditorIngredientRow[]): RecipeIngredient[] =>
  rows.map((row, index) => {
    let quantity: number | null = null;
    try {
      quantity = parseRecipeQuantity(row.quantityInput);
    } catch {
      quantity = Number.NaN;
    }
    return {
      ingredientId: row.ingredientId,
      name: row.name,
      quantity,
      unit: row.unit,
      required: row.required,
      sortOrder: index,
    };
  });

const localDraft = (page: EditorPageContext): RecipeDraft | null => {
  const current = page.data.draft;
  if (!current) return null;
  const steps = page.data.methodSteps.map((instruction, index) => ({
    instruction: textOrNull(instruction),
    sortOrder: index,
  }));
  return {
    ...current,
    version: page.data.version,
    name: textOrNull(page.data.nameInput),
    category: textOrNull(page.data.categoryInput),
    flavor: textOrNull(page.data.flavorInput),
    servings: (() => {
      try {
        return optionalInteger(page.data.servingsInput, 'servings');
      } catch {
        return null;
      }
    })(),
    estimatedMinutes: (() => {
      try {
        return optionalInteger(
          page.data.estimatedMinutesInput,
          'estimatedMinutes',
        );
      } catch {
        return null;
      }
    })(),
    ingredients: draftIngredients(page.data.editorIngredients),
    defaultMethod: page.data.methodConfigured
      ? {
          id: current.defaultMethod?.id ?? 0,
          name: textOrNull(page.data.methodNameInput),
          cookingStyle: textOrNull(page.data.cookingStyleInput),
          steps,
        }
      : null,
    image: page.data.selectedImage,
    incompleteSteps: Array.isArray(current.incompleteSteps)
      ? current.incompleteSteps
      : [],
  };
};

const syncLocalDraft = (page: EditorPageContext): void => {
  const draft = localDraft(page);
  if (draft && canSetData(page)) page.setData({ draft });
};

const replaceFieldError = (
  page: EditorPageContext,
  field: string,
  message: string,
): void => {
  const fieldErrors = { ...page.data.fieldErrors };
  if (message) fieldErrors[field] = message;
  else delete fieldErrors[field];
  page.setData({ fieldErrors });
};

const clearErrorsWithPrefix = (
  page: EditorPageContext,
  prefix: string,
): void => {
  const fieldErrors = Object.fromEntries(
    Object.entries(page.data.fieldErrors).filter(
      ([field]) => !field.startsWith(prefix),
    ),
  );
  page.setData({ fieldErrors });
};

const fieldErrorsWithIngredientRows = (
  page: EditorPageContext,
  rows: EditorIngredientRow[],
): Record<string, string> => {
  const fieldErrors = Object.fromEntries(
    Object.entries(page.data.fieldErrors).filter(
      ([field]) => !field.startsWith('ingredients['),
    ),
  );
  rows.forEach((row, index) => {
    if (row.quantityError) {
      fieldErrors[`ingredients[${String(index)}].quantity`] = row.quantityError;
    }
    if (row.unitError) {
      fieldErrors[`ingredients[${String(index)}].unit`] = row.unitError;
    }
  });
  return fieldErrors;
};

const fieldErrorsWithMethodErrors = (
  page: EditorPageContext,
  errors: string[],
): Record<string, string> => {
  const fieldErrors = Object.fromEntries(
    Object.entries(page.data.fieldErrors).filter(
      ([field]) => !field.startsWith('steps['),
    ),
  );
  errors.forEach((message, index) => {
    if (message) fieldErrors[`steps[${String(index)}]`] = message;
  });
  return fieldErrors;
};

const hasStepErrors = (page: EditorPageContext, step: RecipeStep): boolean => {
  const fields = Object.keys(page.data.fieldErrors);
  if (step === 'BASIC') {
    return fields.some((field) =>
      ['name', 'category', 'flavor', 'servings', 'estimatedMinutes'].includes(
        field,
      ),
    );
  }
  if (step === 'INGREDIENTS') {
    return fields.some((field) => field.startsWith('ingredients'));
  }
  if (step === 'METHOD') {
    return fields.some(
      (field) =>
        field === 'methodName' ||
        field === 'cookingStyle' ||
        field.startsWith('steps'),
    );
  }
  return false;
};

const ingredientRowsFromDraft = (
  page: EditorPageContext,
  draft: RecipeDraft,
  catalog: Ingredient[],
): EditorIngredientRow[] =>
  Array.isArray(draft.ingredients)
    ? draft.ingredients
        .filter(
          (ingredient) =>
            typeof ingredient?.ingredientId === 'number' &&
            ingredient.ingredientId > 0,
        )
        .map((ingredient) => ({
          clientKey: nextClientKey(page, 'ingredient'),
          ingredientId: ingredient.ingredientId as number,
          name:
            ingredient.name ??
            catalog.find(
              (candidate) => candidate.id === ingredient.ingredientId,
            )?.name ??
            '未命名食材',
          quantityInput:
            ingredient.quantity === null || ingredient.quantity === undefined
              ? ''
              : String(ingredient.quantity),
          unit: ingredient.unit ?? '',
          required: Boolean(ingredient.required),
          quantityError: '',
          unitError: '',
        }))
    : [];

const normalizedDraft = (draft: RecipeDraft): RecipeDraft => ({
  ...draft,
  ingredients: Array.isArray(draft.ingredients) ? draft.ingredients : [],
  incompleteSteps: Array.isArray(draft.incompleteSteps)
    ? draft.incompleteSteps
    : [],
});

const stepHasUnsavedInput = (
  page: EditorPageContext,
  step: EditableRecipeStep,
): boolean =>
  Boolean(runtimeFor(page).autosaves?.[step].dirty()) ||
  hasStepErrors(page, step);

const withoutStepErrors = (
  errors: Record<string, string>,
  step: EditableRecipeStep,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(errors).filter(([field]) => {
      if (step === 'BASIC') {
        return ![
          'name',
          'category',
          'flavor',
          'servings',
          'estimatedMinutes',
        ].includes(field);
      }
      if (step === 'INGREDIENTS') return !field.startsWith('ingredients');
      if (step === 'METHOD') {
        return (
          field !== 'methodName' &&
          field !== 'cookingStyle' &&
          !field.startsWith('steps')
        );
      }
      return true;
    }),
  );

const mergeCanonicalControls = (
  page: EditorPageContext,
  draft: RecipeDraft,
  forceAll = false,
): void => {
  if (!canSetData(page)) return;
  const syncStep = (step: EditableRecipeStep): boolean =>
    forceAll || !stepHasUnsavedInput(page, step);
  const update: Partial<EditorPageData> = {
    draft: normalizedDraft(draft),
    version: draft.version,
  };
  let fieldErrors = { ...page.data.fieldErrors };

  if (syncStep('BASIC')) {
    update.nameInput = draft.name ?? '';
    update.categoryInput = draft.category ?? '';
    update.flavorInput = draft.flavor ?? '';
    update.servingsInput =
      draft.servings === null || draft.servings === undefined
        ? ''
        : String(draft.servings);
    update.estimatedMinutesInput =
      draft.estimatedMinutes === null || draft.estimatedMinutes === undefined
        ? ''
        : String(draft.estimatedMinutes);
    fieldErrors = withoutStepErrors(fieldErrors, 'BASIC');
  }

  if (syncStep('INGREDIENTS')) {
    const ingredients = ingredientRowsFromDraft(
      page,
      draft,
      page.data.ingredientCatalog,
    );
    update.editorIngredients = ingredients;
    update.ingredientLimitMessage =
      ingredients.length >= 50 ? '最多可添加50种食材' : '';
    fieldErrors = withoutStepErrors(fieldErrors, 'INGREDIENTS');
  }

  if (syncStep('METHOD')) {
    const steps = Array.isArray(draft.defaultMethod?.steps)
      ? draft.defaultMethod.steps.map((step) => step.instruction ?? '')
      : [];
    const keys = ensureMethodKeys(page, steps, []);
    update.methodNameInput = draft.defaultMethod?.name ?? '';
    update.cookingStyleInput = draft.defaultMethod?.cookingStyle ?? '';
    update.methodSteps = steps;
    update.methodStepKeys = keys;
    update.methodStepErrors = steps.map(() => '');
    update.methodStepRows = methodRows(steps, keys);
    update.methodConfigured = draft.defaultMethod !== null;
    fieldErrors = withoutStepErrors(fieldErrors, 'METHOD');
  }

  if (syncStep('IMAGE')) update.selectedImage = draft.image ?? null;
  update.fieldErrors = fieldErrors;
  page.setData(update);
};

const disposeAutosaves = (runtime: EditorRuntime): void => {
  if (!runtime.autosaves) return;
  for (const step of ['BASIC', 'INGREDIENTS', 'METHOD', 'IMAGE'] as const) {
    runtime.autosaves[step].dispose();
  }
  runtime.autosaves = null;
};

const acceptCanonicalDraft = (
  page: EditorPageContext,
  draft: RecipeDraft,
): RecipeDraft => {
  const runtime = runtimeFor(page);
  if (
    draft.id !== page.data.recipeId ||
    !Number.isSafeInteger(draft.version) ||
    draft.version <= runtime.serverVersion
  ) {
    throw new Error('INVALID_RECIPE_SAVE_RESPONSE');
  }
  runtime.serverVersion = draft.version;
  if (canSetData(page)) {
    page.setData({ draft, version: draft.version });
  }
  return draft;
};

const markAccessLost = (page: EditorPageContext, error: unknown): void => {
  if (!accessWasLost(error)) return;
  const runtime = runtimeFor(page);
  runtime.writesDisabled = true;
  disposeAutosaves(runtime);
  if (canSetData(page)) {
    page.setData({
      readOnly: true,
      activeStep: 'PREVIEW',
      publishErrorMessage:
        errorCodeOf(error) === 'DINNER_RECIPE_NOT_FOUND'
          ? '这份菜谱已不存在，请返回家庭菜谱'
          : '你已无权编辑这份菜谱，请返回家庭菜谱',
    });
  }
};

const enqueueWrite = (
  page: EditorPageContext,
  write: (expectedVersion: number) => Promise<RecipeDraft>,
): Promise<RecipeDraft> => {
  const runtime = runtimeFor(page);
  const queued = runtime.writeTail
    .catch(() => undefined)
    .then(async () => {
      if (runtime.writesDisabled || runtime.publishedDraft) {
        throw new Error('RECIPE_WRITES_DISABLED');
      }
      const response = await write(runtime.serverVersion);
      return acceptCanonicalDraft(page, response);
    })
    .catch((error: unknown) => {
      markAccessLost(page, error);
      throw normalizeAutosaveError(error);
    });
  runtime.writeTail = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
};

const createStepAutosaves = (page: EditorPageContext): AutosaveBundle => {
  const stateObserver =
    (step: EditableRecipeStep) => (state: RecipeAutosaveState) => {
      const runtime = runtimeFor(page);
      if (state === 'conflict') {
        runtime.conflictedStep = step;
        runtime.failedStep = step;
      }
      if (state === 'error') runtime.failedStep = step;
      if (state === 'saved' && runtime.conflictedStep === step) {
        runtime.conflictedStep = null;
      }
      if (state === 'saved' && runtime.failedStep === step) {
        runtime.failedStep = null;
      }
      if (
        runtime.failedStep &&
        runtime.failedStep !== step &&
        (state === 'saved' || state === 'idle')
      ) {
        return;
      }
      setSaveState(page, state);
    };
  const versionObserver = (version: number): void => {
    const runtime = runtimeFor(page);
    if (version > runtime.serverVersion) runtime.serverVersion = version;
    if (canSetData(page) && version >= page.data.version) {
      page.setData({ version });
    }
  };

  return {
    BASIC: createRecipeAutosave<BasicSnapshot>({
      getVersion: () => runtimeFor(page).serverVersion,
      save: (value) =>
        enqueueWrite(page, (version) =>
          getApp<OsheeepApp>().saveRecipeBasicInfo(page.data.recipeId, {
            version,
            name: value.name ?? null,
            category: value.category ?? null,
            flavor: value.flavor ?? null,
            servings: value.servings ?? null,
            estimatedMinutes: value.estimatedMinutes ?? null,
          }),
        ),
      onVersion: versionObserver,
      onState: stateObserver('BASIC'),
    }),
    INGREDIENTS: createRecipeAutosave<IngredientSnapshot>({
      getVersion: () => runtimeFor(page).serverVersion,
      save: (value) => {
        if (value.ingredients === null) {
          return Promise.reject(new RecipeQuantityError());
        }
        const ingredients = value.ingredients.map((ingredient) => ({
          ...ingredient,
        }));
        return enqueueWrite(page, (version) =>
          getApp<OsheeepApp>().saveRecipeIngredients(page.data.recipeId, {
            version,
            ingredients,
          }),
        );
      },
      onVersion: versionObserver,
      onState: stateObserver('INGREDIENTS'),
    }),
    METHOD: createRecipeAutosave<MethodSaveSnapshot>({
      getVersion: () => runtimeFor(page).serverVersion,
      save: (value) => {
        if (!value.method) {
          return Promise.reject(
            new EditorFieldError('defaultMethod', '请先修正做法字段'),
          );
        }
        const snapshot: MethodSnapshot = {
          name: value.method.name ?? null,
          cookingStyle: value.method.cookingStyle ?? null,
          steps: value.method.steps.map((step) => ({
            instruction: step.instruction ?? null,
          })),
        };
        return enqueueWrite(page, (version) =>
          getApp<OsheeepApp>().saveRecipeDefaultMethod(page.data.recipeId, {
            version,
            ...snapshot,
          }),
        );
      },
      onVersion: versionObserver,
      onState: stateObserver('METHOD'),
    }),
    IMAGE: createRecipeAutosave<number | null>({
      getVersion: () => runtimeFor(page).serverVersion,
      save: (imageAssetId) =>
        enqueueWrite(page, (version) =>
          getApp<OsheeepApp>().saveRecipeImage(
            page.data.recipeId,
            version,
            imageAssetId,
          ),
        ),
      onVersion: versionObserver,
      onState: stateObserver('IMAGE'),
    }),
  };
};

const scheduleBasic = (page: EditorPageContext): void => {
  const autosave = runtimeFor(page).autosaves?.BASIC;
  if (!autosave) return;
  try {
    const snapshot = basicSnapshot(page);
    clearErrorsWithPrefix(page, 'basic:');
    autosave.schedule({ ...snapshot });
  } catch (error) {
    if (error instanceof EditorFieldError) {
      replaceFieldError(page, error.field, error.message);
    }
  }
};

const scheduleIngredients = (page: EditorPageContext): void => {
  const autosave = runtimeFor(page).autosaves?.INGREDIENTS;
  if (!autosave) return;
  const ingredients = safeIngredientPayload(page.data.editorIngredients);
  autosave.schedule({
    ingredients: ingredients?.map((ingredient) => ({ ...ingredient })) ?? null,
  });
};

const scheduleMethod = (page: EditorPageContext): void => {
  const autosave = runtimeFor(page).autosaves?.METHOD;
  if (!autosave) return;
  try {
    const snapshot = methodSnapshot(page);
    autosave.schedule({
      method: {
        ...snapshot,
        steps: snapshot.steps.map((step) => ({ ...step })),
      },
    });
  } catch (error) {
    if (error instanceof EditorFieldError) {
      replaceFieldError(page, error.field, error.message);
    }
    autosave.schedule({ method: null });
  }
};

const activeAutosave = (
  page: EditorPageContext,
): RecipeAutosave<unknown> | null => {
  const autosaves = runtimeFor(page).autosaves;
  if (!autosaves || !isEditableStep(page.data.activeStep)) return null;
  return autosaves[page.data.activeStep] as RecipeAutosave<unknown>;
};

const flushActive = async (page: EditorPageContext): Promise<void> => {
  const step = page.data.activeStep;
  try {
    await activeAutosave(page)?.flush();
  } catch (error) {
    if (isEditableStep(step)) runtimeFor(page).failedStep = step;
    throw error;
  }
};

const flushAll = async (page: EditorPageContext): Promise<void> => {
  const autosaves = runtimeFor(page).autosaves;
  if (!autosaves) return;
  for (const step of ['BASIC', 'INGREDIENTS', 'METHOD', 'IMAGE'] as const) {
    try {
      await autosaves[step].flush();
    } catch (error) {
      runtimeFor(page).failedStep = step;
      throw error;
    }
  }
};

const saveFailureState = (page: EditorPageContext, error: unknown): void => {
  markAccessLost(page, error);
  setSaveState(
    page,
    errorCodeOf(error) === 'DINNER_RECIPE_VERSION_CONFLICT'
      ? 'conflict'
      : 'error',
  );
};

const hydrateDraft = (
  page: EditorPageContext,
  draft: RecipeDraft,
  catalog: Ingredient[],
): void => {
  const runtime = runtimeFor(page);
  const ingredients = ingredientRowsFromDraft(page, draft, catalog);
  const serverSteps = Array.isArray(draft.defaultMethod?.steps)
    ? draft.defaultMethod.steps
    : [];
  const steps = serverSteps.map((step) => step.instruction ?? '');
  const keys = ensureMethodKeys(page, steps, []);
  const readOnly = draft.status !== 'DRAFT';
  runtime.serverVersion = draft.version;
  runtime.writesDisabled = readOnly;
  runtime.conflictedStep = null;
  runtime.failedStep = null;
  runtime.publishedDraft = readOnly ? draft : null;
  runtime.pendingRedirect = false;
  page.setData({
    loading: false,
    loadErrorMessage: '',
    recipeId: draft.id,
    version: draft.version,
    activeStep: readOnly ? 'PREVIEW' : 'BASIC',
    nameInput: draft.name ?? '',
    categoryInput: draft.category ?? '',
    flavorInput: draft.flavor ?? '',
    servingsInput:
      draft.servings === null || draft.servings === undefined
        ? ''
        : String(draft.servings),
    estimatedMinutesInput:
      draft.estimatedMinutes === null || draft.estimatedMinutes === undefined
        ? ''
        : String(draft.estimatedMinutes),
    editorIngredients: ingredients,
    ingredientCatalog: catalog,
    ingredientLimitMessage:
      ingredients.length >= 50 ? '最多可添加50种食材' : '',
    methodNameInput: draft.defaultMethod?.name ?? '',
    cookingStyleInput: draft.defaultMethod?.cookingStyle ?? '',
    methodSteps: steps,
    methodStepKeys: keys,
    methodStepErrors: steps.map(() => ''),
    methodStepRows: methodRows(steps, keys),
    methodConfigured: draft.defaultMethod !== null,
    selectedImage: draft.image ?? null,
    draft: normalizedDraft(draft),
    saveState: 'saved',
    saveMessage: '已保存',
    fieldErrors: {},
    publishIssues: [],
    publishErrorMessage: '',
    refreshPending: false,
    redirectRetryAvailable: false,
    publishConflictRecoveryAvailable: false,
    readOnly,
  });
  disposeAutosaves(runtime);
  if (!readOnly) runtime.autosaves = createStepAutosaves(page);
};

const loadRecipe = async (page: EditorPageContext): Promise<void> => {
  const runtime = runtimeFor(page);
  const id = page.data.recipeId;
  if (!Number.isSafeInteger(id) || id <= 0 || runtime.destroyed) return;
  const token = ++runtime.loadToken;
  disposeAutosaves(runtime);
  page.setData({ loading: true, loadErrorMessage: '' });
  const app = getApp<OsheeepApp>();
  try {
    const [draft, catalogResult] = await Promise.all([
      app.getRecipeDraft(id),
      app
        .getIngredients()
        .then((catalog) => ({ catalog, failed: false }))
        .catch(() => ({ catalog: [] as Ingredient[], failed: true })),
    ]);
    if (runtime.destroyed || token !== runtime.loadToken) return;
    if (draft.id !== id || !Number.isSafeInteger(draft.version)) {
      throw new Error('INVALID_RECIPE_DETAIL_RESPONSE');
    }
    page.setData({
      catalogErrorMessage: catalogResult.failed
        ? '暂时无法读取食材目录，请稍后重试'
        : '',
    });
    hydrateDraft(page, draft, catalogResult.catalog);
  } catch {
    if (runtime.destroyed || token !== runtime.loadToken) return;
    page.setData({
      loading: false,
      loadErrorMessage: '暂时无法读取菜谱，请稍后重试',
    });
  }
};

const refreshCanonicalVersion = (
  page: EditorPageContext,
  failureMessage: string,
): Promise<boolean> => {
  const runtime = runtimeFor(page);
  if (canSetData(page)) page.setData({ refreshPending: true });
  const operation = runtime.writeTail
    .catch(() => undefined)
    .then(async () => {
      const draft = await getApp<OsheeepApp>().getRecipeDraft(
        page.data.recipeId,
      );
      if (runtime.destroyed) return false;
      if (
        draft.id !== page.data.recipeId ||
        !Number.isSafeInteger(draft.version)
      ) {
        return false;
      }
      if (draft.status !== 'DRAFT') {
        if (draft.version >= runtime.serverVersion) {
          runtime.serverVersion = draft.version;
          mergeCanonicalControls(page, draft, true);
        }
        runtime.writesDisabled = true;
        disposeAutosaves(runtime);
        page.setData({
          readOnly: true,
          activeStep: 'PREVIEW',
          publishErrorMessage: '这份菜谱已不能继续编辑',
        });
        return false;
      }
      if (draft.version <= runtime.serverVersion) return false;
      runtime.serverVersion = draft.version;
      mergeCanonicalControls(page, draft);
      return true;
    })
    .catch((error: unknown) => {
      markAccessLost(page, error);
      if (canSetData(page) && !accessWasLost(error)) {
        page.setData({ publishErrorMessage: failureMessage });
      }
      return false;
    })
    .finally(() => {
      if (canSetData(page)) page.setData({ refreshPending: false });
    });
  runtime.writeTail = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
};

const refreshConflictVersion = (page: EditorPageContext): Promise<boolean> =>
  refreshCanonicalVersion(page, '刷新菜谱失败，请稍后重试');

const navigateBackAfterFlush = (page: EditorPageContext): Promise<void> => {
  const runtime = runtimeFor(page);
  runtime.controlledNavigation = true;
  return new Promise((resolve, reject) => {
    wx.navigateBack({
      delta: 1,
      success: () => resolve(),
      fail: () => {
        runtime.controlledNavigation = false;
        reject(new Error('RECIPE_BACK_NAVIGATION_FAILED'));
      },
    });
  });
};

const moveToStep = async (
  page: EditorPageContext,
  target: RecipeStep | 'BACK',
): Promise<void> => {
  if (hasStepErrors(page, page.data.activeStep)) {
    setSaveState(page, 'error');
    return;
  }
  try {
    await flushActive(page);
    if (!canSetData(page)) return;
    if (target === 'BACK') {
      await navigateBackAfterFlush(page);
      return;
    }
    page.setData({ activeStep: target, publishErrorMessage: '' });
  } catch (error) {
    saveFailureState(page, error);
  }
};

const startNavigation = (
  page: EditorPageContext,
  target: RecipeStep | 'BACK',
): Promise<void> => {
  const runtime = runtimeFor(page);
  if (
    runtime.navigationOperation ||
    runtime.publishOperation ||
    page.data.loading ||
    page.data.readOnly ||
    page.data.refreshPending ||
    runtime.destroyed
  ) {
    return runtime.navigationOperation ?? Promise.resolve();
  }
  page.setData({ navigationPending: true });
  const operation = moveToStep(page, target).finally(() => {
    if (runtime.navigationOperation === operation) {
      runtime.navigationOperation = null;
    }
    if (canSetData(page)) page.setData({ navigationPending: false });
  });
  runtime.navigationOperation = operation;
  return operation;
};

const validationDetails = (error: unknown): RecipePublishIssue[] | null => {
  const details = detailsOf(error);
  if (!Array.isArray(details)) return null;
  const issues: RecipePublishIssue[] = [];
  for (const detail of details) {
    if (typeof detail !== 'object' || detail === null) return null;
    if (
      !('step' in detail) ||
      !('field' in detail) ||
      !('message' in detail) ||
      !isRecipeStep(detail.step) ||
      detail.step === 'PREVIEW' ||
      typeof detail.field !== 'string' ||
      typeof detail.message !== 'string'
    ) {
      return null;
    }
    issues.push({
      step: detail.step,
      field: detail.field,
      message: detail.message,
    });
  }
  return issues.length ? issues : null;
};

const publishErrorMessage = (error: unknown): string => {
  switch (errorCodeOf(error)) {
    case 'DINNER_RECIPE_CONTENT_REJECTED':
      return '内容没有通过安全检查，草稿已保留';
    case 'DINNER_RECIPE_MODERATION_UNAVAILABLE':
      return '暂时无法完成安全检查，请稍后重试';
    case 'DINNER_RECIPE_IMAGE_INVALID':
      return '这张图片已不可用，请重新选择';
    case 'DINNER_RECIPE_VERSION_CONFLICT':
      return '草稿刚刚发生变化，请刷新后再发布';
    case 'DINNER_RECIPE_VALIDATION_FAILED':
      return '菜谱内容需要调整，请检查后重试';
    case 'FORBIDDEN':
    case 'UNAUTHORIZED':
      return '你已无权编辑这份菜谱，请返回家庭菜谱';
    case 'DINNER_RECIPE_NOT_FOUND':
      return '这份菜谱已不存在，请返回家庭菜谱';
    case 'NETWORK_ERROR':
      return '网络异常，草稿已保留，请稍后重试';
    default:
      return '发布失败，请稍后重试，草稿已保留';
  }
};

const redirectToFamily = (page: EditorPageContext): Promise<void> => {
  const runtime = runtimeFor(page);
  return new Promise((resolve, reject) => {
    wx.redirectTo({
      url: '/pages/family-recipes/index?tab=PUBLISHED',
      success: () => {
        runtime.pendingRedirect = false;
        runtime.controlledNavigation = true;
        if (canSetData(page)) {
          page.setData({ redirectRetryAvailable: false });
        }
        resolve();
      },
      fail: () => reject(new Error('PUBLISHED_RECIPE_REDIRECT_FAILED')),
    });
  });
};

const runPublish = async (page: EditorPageContext): Promise<void> => {
  const runtime = runtimeFor(page);
  if (runtime.pendingRedirect && runtime.publishedDraft) {
    try {
      await redirectToFamily(page);
    } catch {
      if (canSetData(page)) {
        page.setData({
          publishErrorMessage: '菜谱已发布，暂时无法返回，请重试',
          redirectRetryAvailable: true,
        });
      }
    }
    return;
  }
  if (page.data.readOnly || runtime.writesDisabled) {
    if (canSetData(page)) {
      page.setData({ publishErrorMessage: '只有草稿可以发布' });
    }
    return;
  }
  if (Object.keys(page.data.fieldErrors).length) {
    const draft = localDraft(page);
    const issues = draft ? validateRecipeForPublish(draft) : [];
    page.setData({
      activeStep: 'PREVIEW',
      publishIssues: issues,
      publishErrorMessage: '请先修正字段错误',
    });
    return;
  }
  try {
    await flushAll(page);
  } catch (error) {
    saveFailureState(page, error);
    if (canSetData(page)) {
      page.setData({ publishErrorMessage: '请先完成草稿保存再发布' });
    }
    return;
  }
  if (runtime.destroyed) return;
  const draft = localDraft(page);
  if (!draft) return;
  const issues = validateRecipeForPublish(draft);
  if (issues.length) {
    page.setData({
      activeStep: 'PREVIEW',
      draft,
      publishIssues: issues,
      publishErrorMessage: '',
    });
    return;
  }
  try {
    const published = await getApp<OsheeepApp>().publishRecipe(
      page.data.recipeId,
      runtime.serverVersion,
    );
    if (runtime.destroyed) return;
    acceptCanonicalDraft(page, published);
    runtime.publishedDraft = published;
    runtime.pendingRedirect = true;
    runtime.writesDisabled = true;
    disposeAutosaves(runtime);
    page.setData({
      draft: published,
      version: published.version,
      publishIssues: [],
      publishErrorMessage: '',
      redirectRetryAvailable: false,
      publishConflictRecoveryAvailable: false,
      readOnly: true,
    });
    try {
      await redirectToFamily(page);
    } catch {
      if (canSetData(page)) {
        page.setData({
          publishErrorMessage: '菜谱已发布，暂时无法返回，请重试',
          redirectRetryAvailable: true,
        });
      }
    }
  } catch (error) {
    markAccessLost(page, error);
    if (!canSetData(page)) return;
    const details = validationDetails(error);
    if (details) {
      page.setData({
        activeStep: 'PREVIEW',
        publishIssues: details,
        publishErrorMessage: '请按提示完善菜谱',
      });
      return;
    }
    const publishConflict =
      errorCodeOf(error) === 'DINNER_RECIPE_VERSION_CONFLICT';
    page.setData({
      publishErrorMessage: publishErrorMessage(error),
      publishConflictRecoveryAvailable: publishConflict,
    });
  }
};

Page({
  data: {
    loading: true,
    loadErrorMessage: '',
    catalogErrorMessage: '',
    recipeId: 0,
    version: 0,
    activeStep: 'BASIC' as RecipeStep,
    stepOptions: STEP_OPTIONS,
    nameInput: '',
    categoryInput: '',
    flavorInput: '',
    servingsInput: '',
    estimatedMinutesInput: '',
    editorIngredients: [] as EditorIngredientRow[],
    ingredientCatalog: [] as Ingredient[],
    ingredientLimitMessage: '',
    methodNameInput: '',
    cookingStyleInput: '',
    methodSteps: [] as string[],
    methodStepKeys: [] as string[],
    methodStepErrors: [] as string[],
    methodStepRows: [] as MethodStepRow[],
    methodConfigured: false,
    selectedImage: null as RecipeImageAsset | null,
    draft: null as RecipeDraft | null,
    saveState: 'idle' as RecipeAutosaveState,
    saveMessage: '内容会自动保存',
    fieldErrors: {} as Record<string, string>,
    publishIssues: [] as RecipePublishIssue[],
    publishing: false,
    navigationPending: false,
    publishErrorMessage: '',
    refreshPending: false,
    redirectRetryAvailable: false,
    publishConflictRecoveryAvailable: false,
    readOnly: false,
  },

  async onLoad(query: { id?: string }) {
    const runtime = runtimeFor(this);
    runtime.visible = true;
    const id = validDraftId(query.id);
    if (id === null) {
      this.setData({
        loading: false,
        loadErrorMessage: '菜谱地址无效，请返回家庭菜谱重试',
      });
      return;
    }
    this.setData({ recipeId: id });
    await loadRecipe(this);
  },

  onShow() {
    const runtime = runtimeFor(this);
    if (!runtime.destroyed) runtime.visible = true;
  },

  async onRetryLoad() {
    await loadRecipe(this);
  },

  onHide() {
    const runtime = runtimeFor(this);
    runtime.visible = false;
    if (runtime.destroyed || runtime.publishedDraft || this.data.readOnly)
      return;
    void flushActive(this).catch((error: unknown) => {
      saveFailureState(this, error);
    });
  },

  onUnload() {
    const runtime = runtimeFor(this);
    if (runtime.destroyed) return;
    runtime.visible = false;
    runtime.destroyed = true;
    runtime.loadToken += 1;
    if (!runtime.publishedDraft && runtime.autosaves) {
      void flushAll(this)
        .catch(() => undefined)
        .finally(() => disposeAutosaves(runtime));
      return;
    }
    disposeAutosaves(runtime);
  },

  onBasicInput(event: WechatMiniprogram.Input) {
    if (mutationIsLocked(this)) return;
    const field = String(event.currentTarget.dataset.field ?? '');
    const value = event.detail.value;
    const update: Partial<EditorPageData> = {};
    if (field === 'name') update.nameInput = value;
    else if (field === 'category') update.categoryInput = value;
    else if (field === 'flavor') update.flavorInput = value;
    else if (field === 'servings') update.servingsInput = value;
    else if (field === 'estimatedMinutes') update.estimatedMinutesInput = value;
    else return;
    replaceFieldError(this, field, '');
    this.setData(update, () => {
      try {
        basicSnapshot(this);
      } catch (error) {
        if (error instanceof EditorFieldError) {
          replaceFieldError(this, error.field, error.message);
        }
      }
      syncLocalDraft(this);
      scheduleBasic(this);
    });
  },

  onAddIngredient(event: WechatMiniprogram.TouchEvent) {
    if (mutationIsLocked(this)) return;
    const fromDataset = event.currentTarget.dataset.ingredient as
      Ingredient | undefined;
    const id = Number(fromDataset?.id ?? event.currentTarget.dataset.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    if (
      this.data.editorIngredients.some(
        (ingredient) => ingredient.ingredientId === id,
      )
    ) {
      return;
    }
    if (this.data.editorIngredients.length >= 50) {
      this.setData({ ingredientLimitMessage: '最多可添加50种食材' });
      return;
    }
    const catalog = this.data.ingredientCatalog.find(
      (ingredient) => ingredient.id === id,
    );
    const name = String(
      fromDataset?.name ??
        event.currentTarget.dataset.name ??
        catalog?.name ??
        '',
    );
    const unit = String(
      fromDataset?.defaultUnit ??
        event.currentTarget.dataset.unit ??
        catalog?.defaultUnit ??
        '',
    );
    if (!name || !unit) return;
    const editorIngredients = [
      ...this.data.editorIngredients,
      {
        clientKey: nextClientKey(this, 'ingredient'),
        ingredientId: id,
        name,
        quantityInput: '',
        unit,
        required: true,
        quantityError: '',
        unitError: '',
      },
    ];
    this.setData(
      {
        editorIngredients,
        ingredientLimitMessage:
          editorIngredients.length >= 50 ? '最多可添加50种食材' : '',
        fieldErrors: fieldErrorsWithIngredientRows(this, editorIngredients),
      },
      () => {
        syncLocalDraft(this);
        scheduleIngredients(this);
      },
    );
  },

  onIngredientQuantityInput(event: WechatMiniprogram.Input) {
    if (mutationIsLocked(this)) return;
    const id = Number(event.currentTarget.dataset.id);
    const rawIndex = Number(event.currentTarget.dataset.index);
    const index =
      Number.isSafeInteger(id) && id > 0
        ? this.data.editorIngredients.findIndex(
            (ingredient) => ingredient.ingredientId === id,
          )
        : rawIndex;
    if (index < 0 || index >= this.data.editorIngredients.length) return;
    let message = '';
    try {
      parseRecipeQuantity(event.detail.value);
    } catch (error) {
      message =
        error instanceof RecipeQuantityError
          ? error.message
          : '食材数量格式不正确';
    }
    const editorIngredients = this.data.editorIngredients.map(
      (ingredient, candidateIndex) =>
        candidateIndex === index
          ? {
              ...ingredient,
              quantityInput: event.detail.value,
              quantityError: message,
            }
          : ingredient,
    );
    this.setData(
      {
        editorIngredients,
        fieldErrors: fieldErrorsWithIngredientRows(this, editorIngredients),
      },
      () => {
        syncLocalDraft(this);
        scheduleIngredients(this);
      },
    );
  },

  onIngredientUnitInput(event: WechatMiniprogram.Input) {
    if (mutationIsLocked(this)) return;
    const id = Number(event.currentTarget.dataset.id);
    const index = this.data.editorIngredients.findIndex(
      (ingredient) => ingredient.ingredientId === id,
    );
    if (index < 0) return;
    const message =
      event.detail.value.trim() && event.detail.value.length <= 16
        ? ''
        : '请填写食材单位';
    const editorIngredients = this.data.editorIngredients.map(
      (ingredient, candidateIndex) =>
        candidateIndex === index
          ? { ...ingredient, unit: event.detail.value, unitError: message }
          : ingredient,
    );
    this.setData(
      {
        editorIngredients,
        fieldErrors: fieldErrorsWithIngredientRows(this, editorIngredients),
      },
      () => {
        syncLocalDraft(this);
        scheduleIngredients(this);
      },
    );
  },

  onToggleIngredientRequired(event: WechatMiniprogram.TouchEvent) {
    if (mutationIsLocked(this)) return;
    const id = Number(event.currentTarget.dataset.id);
    if (!this.data.editorIngredients.some((item) => item.ingredientId === id)) {
      return;
    }
    const editorIngredients = this.data.editorIngredients.map((ingredient) =>
      ingredient.ingredientId === id
        ? { ...ingredient, required: !ingredient.required }
        : ingredient,
    );
    this.setData({ editorIngredients }, () => {
      syncLocalDraft(this);
      scheduleIngredients(this);
    });
  },

  onRemoveIngredient(event: WechatMiniprogram.TouchEvent) {
    if (mutationIsLocked(this)) return;
    const id = Number(event.currentTarget.dataset.id);
    const index = this.data.editorIngredients.findIndex(
      (ingredient) => ingredient.ingredientId === id,
    );
    if (index < 0) return;
    const editorIngredients = this.data.editorIngredients.filter(
      (ingredient) => ingredient.ingredientId !== id,
    );
    this.setData(
      {
        editorIngredients,
        ingredientLimitMessage: '',
        fieldErrors: fieldErrorsWithIngredientRows(this, editorIngredients),
      },
      () => {
        syncLocalDraft(this);
        scheduleIngredients(this);
      },
    );
  },

  currentIngredientPayload(): RecipeIngredientInput[] {
    return ingredientPayload(this.data.editorIngredients);
  },

  onMethodNameInput(event: WechatMiniprogram.Input) {
    if (mutationIsLocked(this)) return;
    const message =
      event.detail.value.length > 40 ? '做法名称最多填写40个字' : '';
    this.setData(
      { methodNameInput: event.detail.value, methodConfigured: true },
      () => {
        replaceFieldError(this, 'methodName', message);
        syncLocalDraft(this);
        scheduleMethod(this);
      },
    );
  },

  onCookingStyleInput(event: WechatMiniprogram.Input) {
    if (mutationIsLocked(this)) return;
    const message =
      event.detail.value.length > 32 ? '烹饪方式最多填写32个字' : '';
    this.setData(
      { cookingStyleInput: event.detail.value, methodConfigured: true },
      () => {
        replaceFieldError(this, 'cookingStyle', message);
        syncLocalDraft(this);
        scheduleMethod(this);
      },
    );
  },

  onMethodStepInput(event: WechatMiniprogram.Input) {
    if (mutationIsLocked(this)) return;
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isSafeInteger(index) || index < 0 || index > 11) return;
    const methodSteps = [...this.data.methodSteps];
    while (methodSteps.length <= index) methodSteps.push('');
    methodSteps[index] = event.detail.value;
    const methodStepKeys = ensureMethodKeys(this, methodSteps);
    const message =
      event.detail.value.length > 160 ? '每个步骤最多160个字' : '';
    const methodStepErrors = methodSteps.map((_, candidateIndex) =>
      candidateIndex === index
        ? message
        : (this.data.methodStepErrors[candidateIndex] ?? ''),
    );
    this.setData(
      {
        methodSteps,
        methodStepKeys,
        methodStepErrors,
        methodStepRows: methodRows(
          methodSteps,
          methodStepKeys,
          methodStepErrors,
        ),
        methodConfigured: true,
      },
      () => {
        replaceFieldError(this, `steps[${String(index)}]`, message);
        syncLocalDraft(this);
        scheduleMethod(this);
      },
    );
  },

  onAddMethodStep() {
    if (mutationIsLocked(this) || this.data.methodSteps.length >= 12) {
      return;
    }
    const methodSteps = [...this.data.methodSteps, ''];
    const methodStepKeys = [
      ...ensureMethodKeys(this, this.data.methodSteps),
      nextClientKey(this, 'method'),
    ];
    const methodStepErrors = [...this.data.methodStepErrors, ''];
    this.setData(
      {
        methodSteps,
        methodStepKeys,
        methodStepErrors,
        methodStepRows: methodRows(
          methodSteps,
          methodStepKeys,
          methodStepErrors,
        ),
        methodConfigured: true,
      },
      () => {
        syncLocalDraft(this);
        scheduleMethod(this);
      },
    );
  },

  onMoveStepUp(event: WechatMiniprogram.TouchEvent) {
    if (mutationIsLocked(this)) return;
    const index = Number(event.currentTarget.dataset.index);
    if (
      !Number.isSafeInteger(index) ||
      index <= 0 ||
      index >= this.data.methodSteps.length
    ) {
      return;
    }
    const methodSteps = [...this.data.methodSteps];
    const methodStepKeys = ensureMethodKeys(this, methodSteps);
    const methodStepErrors = methodSteps.map(
      (_, candidateIndex) => this.data.methodStepErrors[candidateIndex] ?? '',
    );
    [methodSteps[index - 1], methodSteps[index]] = [
      methodSteps[index],
      methodSteps[index - 1],
    ];
    [methodStepKeys[index - 1], methodStepKeys[index]] = [
      methodStepKeys[index],
      methodStepKeys[index - 1],
    ];
    [methodStepErrors[index - 1], methodStepErrors[index]] = [
      methodStepErrors[index],
      methodStepErrors[index - 1],
    ];
    this.setData(
      {
        methodSteps,
        methodStepKeys,
        methodStepErrors,
        methodStepRows: methodRows(
          methodSteps,
          methodStepKeys,
          methodStepErrors,
        ),
        fieldErrors: fieldErrorsWithMethodErrors(this, methodStepErrors),
        methodConfigured: true,
      },
      () => {
        syncLocalDraft(this);
        scheduleMethod(this);
      },
    );
  },

  onMoveStepDown(event: WechatMiniprogram.TouchEvent) {
    if (mutationIsLocked(this)) return;
    const index = Number(event.currentTarget.dataset.index);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= this.data.methodSteps.length - 1
    ) {
      return;
    }
    const methodSteps = [...this.data.methodSteps];
    const methodStepKeys = ensureMethodKeys(this, methodSteps);
    const methodStepErrors = methodSteps.map(
      (_, candidateIndex) => this.data.methodStepErrors[candidateIndex] ?? '',
    );
    [methodSteps[index], methodSteps[index + 1]] = [
      methodSteps[index + 1],
      methodSteps[index],
    ];
    [methodStepKeys[index], methodStepKeys[index + 1]] = [
      methodStepKeys[index + 1],
      methodStepKeys[index],
    ];
    [methodStepErrors[index], methodStepErrors[index + 1]] = [
      methodStepErrors[index + 1],
      methodStepErrors[index],
    ];
    this.setData(
      {
        methodSteps,
        methodStepKeys,
        methodStepErrors,
        methodStepRows: methodRows(
          methodSteps,
          methodStepKeys,
          methodStepErrors,
        ),
        fieldErrors: fieldErrorsWithMethodErrors(this, methodStepErrors),
        methodConfigured: true,
      },
      () => {
        syncLocalDraft(this);
        scheduleMethod(this);
      },
    );
  },

  onRemoveMethodStep(event: WechatMiniprogram.TouchEvent) {
    if (mutationIsLocked(this)) return;
    const index = Number(event.currentTarget.dataset.index);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= this.data.methodSteps.length
    ) {
      return;
    }
    const methodSteps = this.data.methodSteps.filter(
      (_, candidateIndex) => candidateIndex !== index,
    );
    const methodStepKeys = ensureMethodKeys(this, this.data.methodSteps).filter(
      (_, candidateIndex) => candidateIndex !== index,
    );
    const methodStepErrors = this.data.methodStepErrors.filter(
      (_, candidateIndex) => candidateIndex !== index,
    );
    this.setData(
      {
        methodSteps,
        methodStepKeys,
        methodStepErrors,
        methodStepRows: methodRows(
          methodSteps,
          methodStepKeys,
          methodStepErrors,
        ),
        fieldErrors: fieldErrorsWithMethodErrors(this, methodStepErrors),
        methodConfigured: true,
      },
      () => {
        syncLocalDraft(this);
        scheduleMethod(this);
      },
    );
  },

  onChooseImage() {
    if (mutationIsLocked(this)) return;
    wx.navigateTo({
      url: '/pages/recipe-images/index',
      events: {
        imageSelected: (image: RecipeImageAsset) => {
          const runtime = runtimeFor(this);
          if (runtime.destroyed || mutationIsLocked(this)) return;
          this.setData({ selectedImage: image }, () => {
            syncLocalDraft(this);
            runtime.autosaves?.IMAGE.schedule(image.id);
          });
        },
      },
      fail: () => {
        if (canSetData(this)) {
          this.setData({ publishErrorMessage: '暂时无法打开图片库，请重试' });
        }
      },
    });
  },

  onNextStep(): Promise<void> {
    const index = STEPS.indexOf(this.data.activeStep);
    if (index < 0 || index >= STEPS.length - 1) return Promise.resolve();
    return startNavigation(this, STEPS[index + 1]);
  },

  onPreviousStep(): Promise<void> {
    const index = STEPS.indexOf(this.data.activeStep);
    if (index <= 0) return startNavigation(this, 'BACK');
    return startNavigation(this, STEPS[index - 1]);
  },

  onSelectStep(event: WechatMiniprogram.TouchEvent): Promise<void> {
    const step = event.currentTarget.dataset.step;
    if (!isRecipeStep(step) || step === this.data.activeStep) {
      return Promise.resolve();
    }
    return startNavigation(this, step);
  },

  async onRetrySave() {
    const runtime = runtimeFor(this);
    if (
      runtime.writesDisabled ||
      this.data.readOnly ||
      this.data.refreshPending
    ) {
      return;
    }
    const step =
      runtime.conflictedStep ??
      runtime.failedStep ??
      (isEditableStep(this.data.activeStep) ? this.data.activeStep : null);
    if (!step || !runtime.autosaves) return;
    if (runtime.autosaves[step].state() === 'conflict') {
      const refreshed = await refreshConflictVersion(this);
      if (!refreshed || !runtime.autosaves) return;
    }
    try {
      await runtime.autosaves[step].retry();
    } catch (error) {
      saveFailureState(this, error);
    }
  },

  onRetryRedirect(): Promise<void> {
    const runtime = runtimeFor(this);
    if (!runtime.pendingRedirect || !runtime.publishedDraft) {
      return Promise.resolve();
    }
    return this.onPublish();
  },

  onRefreshPublishConflict(): Promise<void> {
    const runtime = runtimeFor(this);
    if (
      !this.data.publishConflictRecoveryAvailable ||
      this.data.refreshPending ||
      runtime.destroyed ||
      runtime.navigationOperation ||
      runtime.publishOperation
    ) {
      return runtime.navigationOperation ?? Promise.resolve();
    }
    this.setData({ navigationPending: true });
    const operation = refreshCanonicalVersion(this, '刷新草稿失败，请稍后重试')
      .then((refreshed) => {
        if (!refreshed || !canSetData(this)) return;
        this.setData({
          publishConflictRecoveryAvailable: false,
          publishErrorMessage: '已刷新最新草稿，请确认后再次发布',
        });
      })
      .finally(() => {
        if (runtime.navigationOperation === operation) {
          runtime.navigationOperation = null;
        }
        if (canSetData(this)) this.setData({ navigationPending: false });
      });
    runtime.navigationOperation = operation;
    return operation;
  },

  onPublish(): Promise<void> {
    const runtime = runtimeFor(this);
    if (runtime.publishOperation) return runtime.publishOperation;
    if (this.data.refreshPending) return Promise.resolve();
    if (runtime.navigationOperation || this.data.navigationPending) {
      return runtime.navigationOperation ?? Promise.resolve();
    }
    if (runtime.destroyed) return Promise.resolve();
    if (
      this.data.publishConflictRecoveryAvailable &&
      !runtime.pendingRedirect
    ) {
      return Promise.resolve();
    }
    this.setData({
      publishing: true,
      publishErrorMessage: '',
    });
    const operation = runPublish(this).finally(() => {
      if (runtime.publishOperation === operation) {
        runtime.publishOperation = null;
      }
      if (canSetData(this)) this.setData({ publishing: false });
    });
    runtime.publishOperation = operation;
    return operation;
  },

  onJumpToIssue(event: WechatMiniprogram.TouchEvent): Promise<void> {
    const step = event.currentTarget.dataset.step;
    if (!isRecipeStep(step) || step === 'PREVIEW') return Promise.resolve();
    return startNavigation(this, step);
  },
});
