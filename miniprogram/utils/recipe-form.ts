import type { RecipeDraft, RecipeStep } from '../types/recipe';

export interface RecipePublishIssue {
  step: Exclude<RecipeStep, 'PREVIEW'>;
  field: string;
  message: string;
}

export class RecipeQuantityError extends Error {
  constructor() {
    super('食材数量格式不正确');
    this.name = 'RecipeQuantityError';
  }
}

const quantityPattern = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

const validQuantity = (value: number | null): boolean => {
  if (value === null) return true;
  if (!Number.isFinite(value) || value < 0) return false;
  const [integerPart, decimalPart] = String(value).split('.');
  return (
    !String(value).includes('e') &&
    integerPart.length <= 9 &&
    (decimalPart?.length ?? 0) <= 3
  );
};

export const parseRecipeQuantity = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!quantityPattern.test(trimmed)) throw new RecipeQuantityError();
  const quantity = Number(trimmed);
  if (!validQuantity(quantity)) throw new RecipeQuantityError();
  return quantity;
};

export const recipeQuantityLabel = (
  quantity: number | null | undefined,
  unit: string,
): string => (quantity == null ? '适量' : `${quantity}${unit}`);

const hasTextWithin = (
  value: string | null | undefined,
  maximumLength: number,
): boolean =>
  typeof value === 'string' &&
  Boolean(value.trim()) &&
  value.length <= maximumLength;

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
  if (!hasTextWithin(draft.name, 40)) {
    issues.push({ step: 'BASIC', field: 'name', message: '请填写菜名' });
  }
  if (!hasTextWithin(draft.category, 16)) {
    issues.push({ step: 'BASIC', field: 'category', message: '请填写分类' });
  }
  if (!hasTextWithin(draft.flavor, 16)) {
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
  if (draft.ingredients.length > 50) {
    issues.push({
      step: 'INGREDIENTS',
      field: 'ingredients',
      message: '食材不能超过50种',
    });
  }
  draft.ingredients.forEach((ingredient, index) => {
    if (ingredient.ingredientId === null) {
      issues.push({
        step: 'INGREDIENTS',
        field: `ingredients[${index}].ingredientId`,
        message: '请选择有效食材',
      });
    }
    if (!hasTextWithin(ingredient.unit, 16)) {
      issues.push({
        step: 'INGREDIENTS',
        field: `ingredients[${index}].unit`,
        message: '请填写食材单位',
      });
    }
    if (!validQuantity(ingredient.quantity)) {
      issues.push({
        step: 'INGREDIENTS',
        field: `ingredients[${index}].quantity`,
        message: '食材数量格式不正确',
      });
    }
  });
  if (draft.defaultMethod === null) {
    issues.push({
      step: 'METHOD',
      field: 'defaultMethod',
      message: '请填写默认做法',
    });
  } else {
    const steps = draft.defaultMethod.steps ?? [];
    if (!steps.length) {
      issues.push({
        step: 'METHOD',
        field: 'steps',
        message: '至少添加一个做法步骤',
      });
    } else {
      if (steps.length > 12) {
        issues.push({
          step: 'METHOD',
          field: 'steps',
          message: '做法步骤不能超过12步',
        });
      }
      steps.forEach((step, index) => {
        if (!hasTextWithin(step.instruction, 160)) {
          issues.push({
            step: 'METHOD',
            field: `steps[${index}]`,
            message: '请填写做法步骤',
          });
        }
      });
    }
  }
  if (draft.image === null) {
    issues.push({
      step: 'IMAGE',
      field: 'imageAssetId',
      message: '请选择一张已审核真实图片',
    });
  }
  return issues;
};
