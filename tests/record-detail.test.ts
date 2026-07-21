import type { RecordDish } from '../miniprogram/types/record';
import {
  formatSnapshotAmount,
  toRecordDishPresentation,
} from '../miniprogram/utils/record-detail';

const snapshotDish: RecordDish = {
  recipeId: 14,
  name: '番茄炒蛋',
  imagePath: 'https://www.osheeep.com/media/recipes/tomato-list.webp',
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
  name: '番茄炒蛋',
  imagePath: '/assets/recipes/tomato-eggs.jpg',
  category: '家常菜',
  flavor: '酸甜',
  estimatedMinutes: 10,
  source: 'BOTH',
  scope: 'SYSTEM',
  recipeVersion: 1,
  servings: null,
  method: null,
  ingredients: [],
};

test('formats nullable snapshot quantities without treating null as zero', () => {
  expect(formatSnapshotAmount(null, '枚')).toBe('适量');
  expect(formatSnapshotAmount(0, '克')).toBe('0克');
  expect(formatSnapshotAmount(2.5, '克')).toBe('2.5克');
});

test('prepares immutable snapshot details in deterministic display order', () => {
  const view = toRecordDishPresentation(snapshotDish);

  expect(view.scopeLabel).toBe('自家菜谱');
  expect(view.showSnapshotDetails).toBe(true);
  expect(view.method?.steps.map((step) => step.instruction)).toEqual([
    '翻炒',
    '盛盘',
  ]);
  expect(view.ingredients.map((ingredient) => ingredient.name)).toEqual([
    '番茄',
    '鸡蛋',
  ]);
  expect(view.ingredients.map((ingredient) => ingredient.amountLabel)).toEqual([
    '2个',
    '适量',
  ]);
});

test('keeps a normalized legacy dish compact', () => {
  expect(toRecordDishPresentation(legacyDish)).toMatchObject({
    scopeLabel: '',
    method: null,
    ingredients: [],
    showSnapshotDetails: false,
  });
});
