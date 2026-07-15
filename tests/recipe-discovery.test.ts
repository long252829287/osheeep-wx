import type { InventoryItem } from '../miniprogram/types/ingredient';
import type { RecipeMatch, RecipeSummary } from '../miniprogram/types/recipe';
import { toRecipeDiscoveryView } from '../miniprogram/utils/recipe-discovery';

const match = (
  status: RecipeMatch['status'],
  missingIngredients: string[] = [],
): RecipeMatch => ({
  status,
  matchedRequired: status === 'AVAILABLE' ? 2 : 1,
  totalRequired: 2,
  matchPercent: status === 'AVAILABLE' ? 100 : 50,
  missingIngredients,
  unknownQuantityIngredients: status === 'UNKNOWN_QUANTITY' ? ['鸡蛋'] : [],
});

const recipe = (
  id: number,
  status: RecipeMatch['status'],
  missingIngredients: string[] = [],
): RecipeSummary => ({
  id,
  name: `菜谱 ${id}`,
  imagePath: `/recipes/${id}.png`,
  category: '家常菜',
  flavor: '咸鲜',
  estimatedMinutes: 20,
  ingredients: [
    {
      ingredientId: id,
      name: '鸡蛋',
      quantity: null,
      unit: '枚',
      required: true,
      sortOrder: 0,
    },
  ],
  match: match(status, missingIngredients),
});

const inventory: InventoryItem[] = Array.from({ length: 12 }, (_, index) => ({
  ingredientId: index + 1,
  name: `食材 ${index + 1}`,
  category: '家常',
  quantity: index === 0 ? null : index + 1,
  unit: '份',
  version: 0,
  updatedBy: 7,
  updatedAt: '2026-07-15T08:00:00Z',
}));

test('builds a focused first screen with one featured and two rows', () => {
  const recipes = [
    recipe(1, 'AVAILABLE'),
    recipe(2, 'UNKNOWN_QUANTITY'),
    recipe(3, 'MISSING', ['西红柿', '葱']),
    recipe(4, 'AVAILABLE'),
  ];

  const view = toRecipeDiscoveryView(recipes, inventory, false);

  expect(view.pantrySummary).toBe('家里有 12 种食材');
  expect(view.featured?.id).toBe(1);
  expect(view.featured?.matchLabel).toBe('食材齐全');
  expect(view.rows).toHaveLength(2);
  expect(view.rows[0].matchLabel).toBe('数量待确认');
  expect(view.rows[1].matchLabel).toBe('还缺 2 样');
  expect(view.visibleIngredients).toEqual(inventory.slice(0, 3));
  expect(view.hasMoreIngredients).toBe(true);
  expect(view.onlyCookable).toBe(false);
});

test('handles an empty discovery result and a compact pantry', () => {
  const view = toRecipeDiscoveryView([], inventory.slice(0, 2), true);

  expect(view.featured).toBeNull();
  expect(view.rows).toEqual([]);
  expect(view.pantrySummary).toBe('家里有 2 种食材');
  expect(view.visibleIngredients).toEqual(inventory.slice(0, 2));
  expect(view.hasMoreIngredients).toBe(false);
  expect(view.onlyCookable).toBe(true);
});
