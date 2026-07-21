import type {
  FamilyRecipeListItem,
  RecipeDraft,
  RecipeIngredient,
  RecipeMatch,
  RecipeMethodDraft,
  RecipeMethodSummary,
  RecipeScope,
  RecipeSummary,
} from '../miniprogram/types/recipe';
import type { MenuDish } from '../miniprogram/types/menu';
import type { RecordDish } from '../miniprogram/types/record';

type IsOptional<T, Key extends keyof T> =
  object extends Pick<T, Key> ? true : false;

const draftDefaultMethodIsRequired: IsOptional<RecipeDraft, 'defaultMethod'> =
  false;
const draftImageIsRequired: IsOptional<RecipeDraft, 'image'> = false;
const ingredientQuantityIsRequired: IsOptional<RecipeIngredient, 'quantity'> =
  false;
const methodIdIsRequired: IsOptional<RecipeMethodDraft, 'id'> = false;
const discoveredScopeIsRequired: IsOptional<RecipeSummary, 'scope'> = false;
const menuRecipeVersionIsRequired: IsOptional<MenuDish, 'recipeVersion'> =
  false;
const recordIngredientsAreRequired: IsOptional<RecordDish, 'ingredients'> =
  false;

const match: RecipeMatch = {
  status: 'AVAILABLE',
  matchedRequired: 1,
  totalRequired: 1,
  matchPercent: 100,
  missingIngredients: [],
  unknownQuantityIngredients: [],
};

test('models explicit Jackson null keys for a blank custom recipe draft', () => {
  const draft: RecipeDraft = {
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
    updatedAt: null,
  };
  const item: FamilyRecipeListItem = {
    id: 9,
    status: 'DRAFT',
    name: null,
    imageUrl: null,
    category: null,
    flavor: null,
    servings: null,
    estimatedMinutes: null,
    version: 1,
    creatorId: 7,
    creatorName: '小才',
    lastModifiedBy: 7,
    lastModifiedByName: '小才',
    completedStep: 'BASIC',
    updatedAt: '2026-07-20T00:00:00Z',
  };
  const method: RecipeMethodDraft = {
    id: 3,
    name: null,
    cookingStyle: null,
    steps: [],
  };

  expect(draftDefaultMethodIsRequired).toBe(false);
  expect(draftImageIsRequired).toBe(false);
  expect(ingredientQuantityIsRequired).toBe(false);
  expect(methodIdIsRequired).toBe(false);
  expect(Object.keys(draft)).toEqual([
    'id',
    'status',
    'version',
    'name',
    'category',
    'flavor',
    'servings',
    'estimatedMinutes',
    'ingredients',
    'defaultMethod',
    'image',
    'incompleteSteps',
    'updatedAt',
  ]);
  expect(item.imageUrl).toBeNull();
  expect(Object.keys(method)).toEqual(['id', 'name', 'cookingStyle', 'steps']);
});

test('models discovery, menu, and normalized record wire shapes separately', () => {
  const scope: RecipeScope = 'HOUSEHOLD';
  const defaultMethod: RecipeMethodSummary = {
    id: 21,
    name: '家常做法',
    cookingStyle: '炒',
  };
  const discovered: RecipeSummary = {
    id: 14,
    name: '番茄炒蛋',
    imagePath: 'https://www.osheeep.com/media/recipes/tomato-list.webp',
    category: '家常菜',
    flavor: '酸甜',
    estimatedMinutes: 15,
    scope,
    version: 8,
    defaultMethod,
    ingredients: [],
    match,
  };
  const menuDish: MenuDish = {
    recipeId: 14,
    name: '番茄炒蛋',
    imagePath: 'https://www.osheeep.com/media/recipes/tomato-list.webp',
    category: '家常菜',
    flavor: '酸甜',
    estimatedMinutes: 15,
    scope,
    recipeVersion: 8,
    method: defaultMethod,
    source: 'BOTH',
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

  expect(discoveredScopeIsRequired).toBe(false);
  expect(menuRecipeVersionIsRequired).toBe(false);
  expect(recordIngredientsAreRequired).toBe(false);
  expect(discovered.defaultMethod).toEqual(defaultMethod);
  expect(menuDish).not.toHaveProperty('ingredients');
  expect(legacyDish).toEqual(expect.objectContaining({ method: null }));
});
