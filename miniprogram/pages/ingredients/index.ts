import { ApiError } from '../../services/request';
import type {
  Ingredient,
  InventoryItem,
  SaveInventoryItemInput,
} from '../../types/ingredient';
import { toInventoryErrorMessage } from '../../utils/inventory-errors';
import { parseInventoryQuantity } from '../../utils/inventory-input';

interface OsheeepApp {
  getIngredients: () => Promise<Ingredient[]>;
  getInventory: () => Promise<InventoryItem[]>;
  saveInventoryItem: (
    ingredientId: number,
    input: SaveInventoryItemInput,
  ) => Promise<InventoryItem>;
}

interface IngredientPageItem {
  ingredientId: number;
  name: string;
  category: string;
  quantity?: number | null;
  quantityInput: string;
  unit: string;
  version: number;
  stocked: boolean;
  saving: boolean;
  errorMessage: string;
}

interface IngredientGroup {
  category: string;
  anchorId: string;
  items: IngredientPageItem[];
}

interface CategoryShortcut {
  label: string;
  targetId: string;
}

const CATEGORY_ANCHOR_IDS: Record<string, string> = {
  蔬菜: 'ingredient-category-vegetables',
  蛋奶: 'ingredient-category-dairy',
  肉类: 'ingredient-category-meat',
  主食: 'ingredient-category-staples',
  干货: 'ingredient-category-dried',
  调味料: 'ingredient-category-seasonings',
  饮品: 'ingredient-category-drinks',
};

const CATEGORY_SHORTCUTS: CategoryShortcut[] = [
  { label: '全部', targetId: 'inventory-top' },
  { label: '蔬菜', targetId: CATEGORY_ANCHOR_IDS.蔬菜 },
  { label: '蛋奶', targetId: CATEGORY_ANCHOR_IDS.蛋奶 },
  { label: '肉类', targetId: CATEGORY_ANCHOR_IDS.肉类 },
  { label: '主食', targetId: CATEGORY_ANCHOR_IDS.主食 },
];

const quantityInputOf = (quantity?: number | null) =>
  quantity === undefined || quantity === null ? '' : String(quantity);

const createPageItem = (
  ingredient: Ingredient,
  inventoryItem?: InventoryItem,
): IngredientPageItem => ({
  ingredientId: ingredient.id,
  name: ingredient.name,
  category: ingredient.category || '其他',
  quantity: inventoryItem?.quantity,
  quantityInput: quantityInputOf(inventoryItem?.quantity),
  unit: inventoryItem?.unit ?? ingredient.defaultUnit,
  version: inventoryItem?.version ?? 0,
  stocked: Boolean(inventoryItem),
  saving: false,
  errorMessage: '',
});

const mergeIngredientRows = (
  ingredients: Ingredient[],
  inventory: InventoryItem[],
): IngredientPageItem[] => {
  if (ingredients.length === 0) return [];

  const inventoryById = new Map(
    inventory.map((item) => [item.ingredientId, item]),
  );
  const catalogIds = new Set(ingredients.map((item) => item.id));
  const catalogRows = ingredients.map((item) =>
    createPageItem(item, inventoryById.get(item.id)),
  );
  const inventoryOnlyRows = inventory
    .filter((item) => !catalogIds.has(item.ingredientId))
    .map((item) => ({
      ingredientId: item.ingredientId,
      name: item.name,
      category: item.category || '其他',
      quantity: item.quantity,
      quantityInput: quantityInputOf(item.quantity),
      unit: item.unit,
      version: item.version,
      stocked: true,
      saving: false,
      errorMessage: '',
    }));
  return [...catalogRows, ...inventoryOnlyRows];
};

const groupVisibleRows = (
  items: IngredientPageItem[],
  query: string,
): IngredientGroup[] => {
  const search = query.trim().toLocaleLowerCase();
  const visibleItems = search
    ? items.filter(
        (item) =>
          item.name.toLocaleLowerCase().includes(search) ||
          item.category.toLocaleLowerCase().includes(search),
      )
    : items;
  const groups = new Map<string, IngredientPageItem[]>();
  for (const item of visibleItems) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }
  return [...groups].map(([category, groupItems], index) => ({
    category,
    anchorId:
      CATEGORY_ANCHOR_IDS[category] ?? `ingredient-category-${String(index)}`,
    items: groupItems,
  }));
};

const errorCodeOf = (error: unknown) => {
  if (error instanceof ApiError) return error.errorCode;
  if (
    typeof error === 'object' &&
    error !== null &&
    'errorCode' in error &&
    typeof error.errorCode === 'string'
  ) {
    return error.errorCode;
  }
  return undefined;
};

const errorMessageOf = (error: unknown) => {
  const errorCode = errorCodeOf(error);
  return errorCode
    ? toInventoryErrorMessage(errorCode)
    : '操作失败，请稍后重试';
};

Page({
  data: {
    loading: true,
    items: [] as IngredientPageItem[],
    groups: [] as IngredientGroup[],
    searchQuery: '',
    emptySearch: false,
    loadErrorMessage: '',
    hasInventory: false,
    catalogEmpty: false,
    activeCategory: '蔬菜',
    categoryShortcuts: CATEGORY_SHORTCUTS,
  },

  async onShow() {
    await this.loadInventory();
  },

  async onRetry() {
    await this.loadInventory();
  },

  async loadInventory() {
    this.setData({ loading: true, loadErrorMessage: '' });
    try {
      const app = getApp<OsheeepApp>();
      const [ingredients, inventory] = await Promise.all([
        app.getIngredients(),
        app.getInventory(),
      ]);
      const items = mergeIngredientRows(ingredients, inventory);
      const groups = groupVisibleRows(items, this.data.searchQuery);
      this.setData({
        items,
        groups,
        emptySearch:
          ingredients.length > 0 &&
          Boolean(this.data.searchQuery.trim()) &&
          groups.length === 0,
        hasInventory: inventory.length > 0,
        catalogEmpty: ingredients.length === 0,
      });
    } catch (error) {
      this.setData({ loadErrorMessage: errorMessageOf(error) });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSearchInput(event: WechatMiniprogram.Input) {
    const searchQuery = event.detail.value;
    this.setData({ searchQuery });
    this.refreshVisibleGroups(searchQuery);
  },

  onQuantityInput(event: WechatMiniprogram.Input) {
    const ingredientId = Number(event.currentTarget.dataset.id);
    const item = this.data.items.find(
      (candidate) => candidate.ingredientId === ingredientId,
    );
    if (!item || item.saving) return;
    this.updateItem(ingredientId, {
      quantityInput: event.detail.value,
      errorMessage: '',
    });
  },

  onSelectCategory(event: WechatMiniprogram.TouchEvent) {
    const activeCategory = String(event.currentTarget.dataset.category ?? '');
    const targetId = String(event.currentTarget.dataset.target ?? '');
    if (!activeCategory || !targetId) return;

    const scrollToCategory = () => {
      wx.pageScrollTo({
        selector: `#${targetId}`,
        duration: 200,
      });
    };

    if (this.data.searchQuery.trim()) {
      this.setData(
        {
          searchQuery: '',
          groups: groupVisibleRows(this.data.items, ''),
          activeCategory,
          emptySearch: false,
        },
        scrollToCategory,
      );
      return;
    }

    this.setData({ activeCategory }, scrollToCategory);
  },

  refreshVisibleGroups(query?: string) {
    const searchQuery = query ?? this.data.searchQuery;
    const groups = groupVisibleRows(this.data.items, searchQuery);
    this.setData({
      groups,
      activeCategory: searchQuery.trim() ? '全部' : this.data.activeCategory,
      emptySearch:
        !this.data.catalogEmpty &&
        Boolean(searchQuery.trim()) &&
        groups.length === 0,
    });
  },

  updateItem(ingredientId: number, update: Partial<IngredientPageItem>) {
    const items = this.data.items.map((item) =>
      item.ingredientId === ingredientId
        ? {
            ...item,
            ...update,
          }
        : item,
    );
    const groups = groupVisibleRows(items, this.data.searchQuery);
    this.setData({
      items,
      groups,
      emptySearch:
        !this.data.catalogEmpty &&
        Boolean(this.data.searchQuery.trim()) &&
        groups.length === 0,
    });
  },

  replaceSavedItem(saved: InventoryItem) {
    this.updateItem(saved.ingredientId, {
      quantity: saved.quantity,
      quantityInput: quantityInputOf(saved.quantity),
      unit: saved.unit,
      version: saved.version,
      stocked: true,
      saving: false,
      errorMessage: '',
    });
    this.setData({ hasInventory: true });
  },

  async onSaveItem(event: WechatMiniprogram.TouchEvent) {
    const ingredientId = Number(event.currentTarget.dataset.id);
    const item = this.data.items.find(
      (candidate) => candidate.ingredientId === ingredientId,
    );
    if (!item || item.saving) return;

    const attemptedInput = item.quantityInput;
    const quantity = parseInventoryQuantity(attemptedInput);
    if (quantity === null) {
      this.updateItem(ingredientId, {
        errorMessage: '请输入非负数量，最多 9 位整数和 3 位小数',
      });
      return;
    }

    this.updateItem(ingredientId, { saving: true, errorMessage: '' });
    try {
      const saved = await getApp<OsheeepApp>().saveInventoryItem(ingredientId, {
        quantity,
        unit: item.unit,
        version: item.version,
      });
      this.replaceSavedItem(saved);
    } catch (error) {
      await this.recoverInventoryError(ingredientId, attemptedInput, error);
    } finally {
      this.updateItem(ingredientId, { saving: false });
    }
  },

  async recoverInventoryError(
    ingredientId: number,
    attemptedInput: string,
    error: unknown,
  ) {
    const errorCode = errorCodeOf(error);
    if (errorCode !== 'DINNER_INVENTORY_VERSION_CONFLICT') {
      this.updateItem(ingredientId, {
        saving: false,
        errorMessage: errorMessageOf(error),
      });
      return;
    }

    try {
      const app = getApp<OsheeepApp>();
      const [ingredients, inventory] = await Promise.all([
        app.getIngredients(),
        app.getInventory(),
      ]);
      const conflictMessage = toInventoryErrorMessage(errorCode);
      const currentById = new Map(
        this.data.items.map((item) => [item.ingredientId, item]),
      );
      const items = mergeIngredientRows(ingredients, inventory).map(
        (refreshedItem) => {
          const currentItem = currentById.get(refreshedItem.ingredientId);
          if (!currentItem) return refreshedItem;

          const isTarget = refreshedItem.ingredientId === ingredientId;
          const canonicalItem = isTarget
            ? refreshedItem
            : refreshedItem.version > currentItem.version ||
                (refreshedItem.version === currentItem.version &&
                  refreshedItem.stocked &&
                  !currentItem.stocked)
              ? refreshedItem
              : currentItem;
          return {
            ...canonicalItem,
            quantityInput: currentItem.quantityInput,
            saving: isTarget ? false : currentItem.saving,
            errorMessage: isTarget ? conflictMessage : currentItem.errorMessage,
          };
        },
      );
      const groups = groupVisibleRows(items, this.data.searchQuery);
      this.setData({
        items,
        groups,
        emptySearch:
          ingredients.length > 0 &&
          Boolean(this.data.searchQuery.trim()) &&
          groups.length === 0,
        hasInventory:
          inventory.length > 0 || items.some((item) => item.stocked),
        catalogEmpty: ingredients.length === 0,
      });
    } catch (reloadError) {
      this.updateItem(ingredientId, {
        quantityInput: attemptedInput,
        saving: false,
        errorMessage: errorMessageOf(reloadError),
      });
    }
  },
});
