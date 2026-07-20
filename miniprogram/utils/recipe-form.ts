import type { RecipeDraft, RecipeStep } from '../types/recipe';

export interface RecipePublishIssue {
  step: Exclude<RecipeStep, 'PREVIEW'>;
  field:
    | 'name'
    | 'category'
    | 'flavor'
    | 'servings'
    | 'estimatedMinutes'
    | 'ingredients'
    | 'defaultMethod'
    | 'imageAssetId';
  message: string;
}

export const parseRecipeQuantity = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const quantity = Number(trimmed);
  return Number.isFinite(quantity) ? quantity : null;
};

export const recipeQuantityLabel = (
  quantity: number | null | undefined,
  unit: string,
): string => (quantity == null ? '适量' : `${quantity}${unit}`);

const hasText = (value: string | null | undefined): boolean =>
  Boolean(value?.trim());

const hasDefaultMethod = (draft: RecipeDraft): boolean =>
  Boolean(draft.defaultMethod?.steps.some((step) => hasText(step.instruction)));

const isWithinIntegerRange = (
  value: number | null | undefined,
  minimum: number,
  maximum: number,
): boolean =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum;

export const validateRecipeForPublish = (
  draft: RecipeDraft,
): RecipePublishIssue[] => {
  const issues: RecipePublishIssue[] = [];
  if (!hasText(draft.name)) {
    issues.push({ step: 'BASIC', field: 'name', message: '请填写菜名' });
  }
  if (!hasText(draft.category)) {
    issues.push({ step: 'BASIC', field: 'category', message: '请填写分类' });
  }
  if (!hasText(draft.flavor)) {
    issues.push({ step: 'BASIC', field: 'flavor', message: '请填写口味' });
  }
  if (!isWithinIntegerRange(draft.servings, 1, 20)) {
    issues.push({ step: 'BASIC', field: 'servings', message: '请填写份量' });
  }
  if (!isWithinIntegerRange(draft.estimatedMinutes, 1, 1440)) {
    issues.push({
      step: 'BASIC',
      field: 'estimatedMinutes',
      message: '请填写预计耗时',
    });
  }
  if (!draft.ingredients.some((ingredient) => ingredient.required)) {
    issues.push({
      step: 'INGREDIENTS',
      field: 'ingredients',
      message: '至少添加一种必需食材',
    });
  }
  if (!hasDefaultMethod(draft)) {
    issues.push({
      step: 'METHOD',
      field: 'defaultMethod',
      message: '请填写默认做法',
    });
  }
  if (!draft.image?.id) {
    issues.push({
      step: 'IMAGE',
      field: 'imageAssetId',
      message: '请选择一张已审核真实图片',
    });
  }
  return issues;
};
