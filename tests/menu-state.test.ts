import {
  createIdempotencyKey,
  getMenuPrimaryAction,
  getSourcePresentation,
  toMenuDishPresentation,
} from '../miniprogram/utils/menu-state';
import type { MenuDish, TodayMenu } from '../miniprogram/types/menu';

test('creates an RFC 4122 version 4 key from WeChat random bytes', async () => {
  const getRandomValues = jest.fn(({ success }) => {
    success?.({
      randomValues: Uint8Array.from({ length: 16 }, (_, index) => index).buffer,
      errMsg: 'getRandomValues:ok',
    });
  });

  await expect(createIdempotencyKey(getRandomValues)).resolves.toBe(
    '00010203-0405-4607-8809-0a0b0c0d0e0f',
  );
});

test('maps source to text and color semantics', () => {
  expect(getSourcePresentation('ME')).toEqual({
    label: '我想吃',
    tone: 'mine',
  });
  expect(getSourcePresentation('PARTNER')).toEqual({
    label: 'TA 想吃',
    tone: 'partner',
  });
  expect(getSourcePresentation('BOTH')).toEqual({
    label: '都想吃',
    tone: 'both',
  });
});

test('derives the primary action from menu status and dish count', () => {
  expect(getMenuPrimaryAction(menu('DRAFT', 0))).toEqual({
    kind: 'confirm',
    label: '确认今晚菜单',
    disabled: true,
  });
  expect(getMenuPrimaryAction(menu('DRAFT', 1)).disabled).toBe(false);
  expect(getMenuPrimaryAction(menu('CONFIRMED', 1)).kind).toBe('complete');
  expect(getMenuPrimaryAction(menu('COMPLETED', 1)).kind).toBe('record');
});

test('prepares household method context without an empty system placeholder', () => {
  const familyDish: MenuDish = {
    recipeId: 14,
    name: '番茄炒蛋',
    imagePath: 'https://www.osheeep.com/media/recipes/tomato-list.webp',
    category: '家常菜',
    flavor: '酸甜',
    estimatedMinutes: 15,
    scope: 'HOUSEHOLD',
    recipeVersion: 8,
    method: { id: 21, name: '家常做法', cookingStyle: '炒' },
    source: 'BOTH',
  };
  const systemDish: MenuDish = {
    ...familyDish,
    recipeId: 1,
    scope: 'SYSTEM',
    recipeVersion: 1,
    method: null,
    source: 'ME',
  };

  expect(toMenuDishPresentation(familyDish)).toMatchObject({
    sourceLabel: '都想吃',
    sourceTone: 'both',
    contextLabel: '自家菜谱 · 家常做法',
  });
  expect(toMenuDishPresentation(systemDish).contextLabel).toBe('');
});

const menu = (status: TodayMenu['status'], dishCount: number): TodayMenu => ({
  id: 31,
  menuDate: '2026-07-11',
  status,
  version: 4,
  mySelectionCount: 0,
  partnerSelectionCount: 0,
  consensusCount: 0,
  selectedRecipeIds: [],
  dishes: Array.from({ length: dishCount }, (_, index) => ({
    recipeId: index + 1,
    name: '番茄炒蛋',
    imagePath: '/assets/recipes/tomato-eggs.jpg',
    category: '家常菜',
    flavor: '酸甜',
    estimatedMinutes: 10,
    scope: 'SYSTEM',
    recipeVersion: 1,
    method: null,
    source: 'ME',
  })),
});
