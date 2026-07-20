import type { RecipeDraft } from '../miniprogram/types/recipe';
import {
  parseRecipeQuantity,
  recipeQuantityLabel,
  validateRecipeForPublish,
} from '../miniprogram/utils/recipe-form';

const emptyDraft: RecipeDraft = {
  id: 9,
  status: 'DRAFT',
  version: 1,
  ingredients: [],
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
  expect(recipeQuantityLabel(2.5, '克')).toBe('2.5克');
});

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
