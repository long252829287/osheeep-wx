const messages: Record<string, string> = {
  DINNER_MENU_VERSION_CONFLICT: '菜单已被对方更新，请确认最新内容后重新保存',
  DINNER_MENU_EMPTY: '请先选一道今晚想吃的菜',
  DINNER_MENU_COMPLETED: '今晚的菜单已经完成，请明天再来选菜',
  NETWORK_ERROR: '网络连接失败，当前菜单仍为上次内容',
};

export const toMenuErrorMessage = (errorCode: string) =>
  messages[errorCode] ?? '操作失败，请稍后重试';
