import type { RecordDish, RecordIngredientSnapshot } from '../types/record';

export interface RecordIngredientPresentation extends RecordIngredientSnapshot {
  amountLabel: string;
}

export interface RecordDishPresentation extends Omit<
  RecordDish,
  'ingredients'
> {
  scopeLabel: '' | '自家菜谱';
  ingredients: RecordIngredientPresentation[];
  showSnapshotDetails: boolean;
}

export const formatSnapshotAmount = (
  quantity: number | null,
  unit: string,
): string => (quantity === null ? '适量' : `${quantity}${unit}`);

export const toRecordDishPresentation = (
  dish: RecordDish,
): RecordDishPresentation => {
  const method = dish.method
    ? {
        ...dish.method,
        steps: [...dish.method.steps].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      }
    : null;
  const ingredients = [...dish.ingredients]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((ingredient) => ({
      ...ingredient,
      amountLabel: formatSnapshotAmount(ingredient.quantity, ingredient.unit),
    }));

  return {
    ...dish,
    method,
    scopeLabel: dish.scope === 'HOUSEHOLD' ? '自家菜谱' : '',
    ingredients,
    showSnapshotDetails: method !== null || ingredients.length > 0,
  };
};
