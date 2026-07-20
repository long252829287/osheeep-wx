import type {
  FamilyRecipeListItem,
  RecipeDraft,
  RecipeIngredient,
  RecipeMethodDraft,
} from '../miniprogram/types/recipe';

type IsOptional<T, Key extends keyof T> =
  object extends Pick<T, Key> ? true : false;

const draftDefaultMethodIsRequired: IsOptional<RecipeDraft, 'defaultMethod'> =
  false;
const draftImageIsRequired: IsOptional<RecipeDraft, 'image'> = false;
const ingredientQuantityIsRequired: IsOptional<RecipeIngredient, 'quantity'> =
  false;
const methodIdIsRequired: IsOptional<RecipeMethodDraft, 'id'> = false;

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
