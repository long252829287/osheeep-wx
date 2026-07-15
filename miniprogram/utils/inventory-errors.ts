const messages: Record<string, string> = {
  DINNER_INVENTORY_VERSION_CONFLICT: '这项食材刚被对方更新，请确认后重新保存',
  DINNER_INVENTORY_ITEM_NOT_FOUND: '这项食材不存在，请刷新后重试',
  DINNER_INGREDIENT_INVALID: '这项食材暂时无法保存',
  VALIDATION_ERROR: '数量或单位不符合要求，请检查后重试',
  NETWORK_ERROR: '网络连接失败，请稍后重试',
};

export const toInventoryErrorMessage = (errorCode: string) =>
  messages[errorCode] ?? '操作失败，请稍后重试';
