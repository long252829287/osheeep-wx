import type {
  RecipeDraft,
  RecipeIngredient,
} from '../miniprogram/types/recipe';
import {
  parseRecipeQuantity,
  RecipeQuantityError,
  recipeQuantityLabel,
  validateRecipeForPublish,
} from '../miniprogram/utils/recipe-form';

const emptyDraft: RecipeDraft = {
  id: 9,
  status: 'DRAFT',
  version: 1,
  name: null,
  category: null,
  flavor: null,
  servings: null,
  estimatedMinutes: null,
  ingredients: [],
  defaultMethod: null,
  image: null,
  incompleteSteps: ['BASIC', 'INGREDIENTS', 'METHOD', 'IMAGE'],
  updatedAt: '2026-07-20T00:00:00Z',
};

const completeDraft = (): RecipeDraft => ({
  ...emptyDraft,
  name: '番茄炒蛋',
  category: '家常菜',
  flavor: '酸甜',
  servings: 2,
  estimatedMinutes: 15,
  ingredients: [
    {
      ingredientId: 1,
      name: '番茄',
      quantity: null,
      unit: '个',
      required: true,
      sortOrder: 0,
    },
  ],
  defaultMethod: {
    id: 3,
    name: null,
    cookingStyle: null,
    steps: [{ instruction: '切番茄', sortOrder: 0 }],
  },
  image: {
    id: 4,
    displayName: '番茄炒蛋',
    listUrl: '/media/recipes/tomato-list.webp',
    detailUrl: '/media/recipes/tomato-detail.webp',
    sourcePageUrl: 'https://example.test/source',
    author: '作者',
    licenseName: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    acquiredOn: '2026-07-20',
    width: 640,
    height: 480,
  },
});

test('quantity blank maps to null and displays as 适量', () => {
  expect(parseRecipeQuantity('')).toBeNull();
  expect(recipeQuantityLabel(null, '克')).toBe('适量');
});

test('quantity preserves valid decimal values', () => {
  expect(parseRecipeQuantity(' 2.5 ')).toBe(2.5);
  expect(parseRecipeQuantity('999999999.999')).toBe(999999999.999);
  expect(recipeQuantityLabel(2.5, '克')).toBe('2.5克');
});

test.each(['NaN', 'Infinity', '-1', '1000000000', '1.2345'])(
  'quantity rejects an invalid value instead of treating %s as 适量',
  (value) => {
    expect(() => parseRecipeQuantity(value)).toThrow(RecipeQuantityError);
  },
);

test('publish issues are stable by step and field', () => {
  expect(validateRecipeForPublish(emptyDraft)).toEqual([
    { step: 'BASIC', field: 'name', message: '请填写菜名' },
    { step: 'BASIC', field: 'category', message: '请填写分类' },
    { step: 'BASIC', field: 'flavor', message: '请填写口味' },
    { step: 'BASIC', field: 'servings', message: '请填写份量' },
    { step: 'BASIC', field: 'estimatedMinutes', message: '请填写预计耗时' },
    {
      step: 'INGREDIENTS',
      field: 'ingredients',
      message: '至少添加一种必需食材',
    },
    { step: 'METHOD', field: 'defaultMethod', message: '请填写默认做法' },
    {
      step: 'IMAGE',
      field: 'imageAssetId',
      message: '请选择一张已审核真实图片',
    },
  ]);
});

test('default method accepts null labels when it has a non-empty step', () => {
  expect(validateRecipeForPublish(completeDraft())).toEqual([]);
});

test('publish validation enforces positive backend basic-info ranges', () => {
  expect(
    validateRecipeForPublish({
      ...completeDraft(),
      servings: 0,
      estimatedMinutes: 1441,
    }),
  ).toEqual([
    { step: 'BASIC', field: 'servings', message: '请填写份量' },
    {
      step: 'BASIC',
      field: 'estimatedMinutes',
      message: '请填写预计耗时',
    },
  ]);
  expect(
    validateRecipeForPublish({
      ...completeDraft(),
      servings: 20,
      estimatedMinutes: 1440,
    }),
  ).toEqual([]);
});

test('publish validation mirrors backend basic length and ingredient issue order', () => {
  const invalidIngredient: RecipeIngredient = {
    ingredientId: null,
    name: null,
    quantity: -1,
    unit: null,
    required: true,
    sortOrder: 0,
  };
  expect(
    validateRecipeForPublish({
      ...completeDraft(),
      name: '菜'.repeat(41),
      category: '类'.repeat(17),
      flavor: '味'.repeat(17),
      ingredients: [invalidIngredient],
    }),
  ).toEqual([
    { step: 'BASIC', field: 'name', message: '请填写菜名' },
    { step: 'BASIC', field: 'category', message: '请填写分类' },
    { step: 'BASIC', field: 'flavor', message: '请填写口味' },
    {
      step: 'INGREDIENTS',
      field: 'ingredients[0].ingredientId',
      message: '请选择有效食材',
    },
    {
      step: 'INGREDIENTS',
      field: 'ingredients[0].unit',
      message: '请填写食材单位',
    },
    {
      step: 'INGREDIENTS',
      field: 'ingredients[0].quantity',
      message: '食材数量格式不正确',
    },
  ]);
});

test('publish validation mirrors backend ingredient and method boundaries', () => {
  const ingredient = completeDraft().ingredients[0];
  expect(
    validateRecipeForPublish({
      ...completeDraft(),
      ingredients: Array.from({ length: 51 }, () => ingredient),
      defaultMethod: { id: 3, name: null, cookingStyle: null, steps: [] },
    }),
  ).toEqual([
    {
      step: 'INGREDIENTS',
      field: 'ingredients',
      message: '食材不能超过50种',
    },
    { step: 'METHOD', field: 'steps', message: '至少添加一个做法步骤' },
  ]);

  expect(
    validateRecipeForPublish({
      ...completeDraft(),
      defaultMethod: {
        id: 3,
        name: null,
        cookingStyle: null,
        steps: [
          { instruction: ' ', sortOrder: 0 },
          { instruction: '步'.repeat(161), sortOrder: 1 },
          ...Array.from({ length: 11 }, (_, index) => ({
            instruction: `步骤${index + 3}`,
            sortOrder: index + 2,
          })),
        ],
      },
    }),
  ).toEqual([
    { step: 'METHOD', field: 'steps', message: '做法步骤不能超过12步' },
    { step: 'METHOD', field: 'steps[0]', message: '请填写做法步骤' },
    { step: 'METHOD', field: 'steps[1]', message: '请填写做法步骤' },
  ]);
});
