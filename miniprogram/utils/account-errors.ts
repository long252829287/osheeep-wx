const messages: Record<string, string> = {
  ACCOUNT_DELETION_IDENTITY_MISMATCH: '当前微信身份与登录账号不一致，无法注销',
  WECHAT_LOGIN_FAILED: '微信身份验证失败，请重新尝试',
  NETWORK_ERROR: '网络连接失败，请稍后重试',
  UNAUTHORIZED: '登录状态已失效，请重新登录',
};

export const toAccountDeletionErrorMessage = (errorCode: string) =>
  messages[errorCode] ?? '注销失败，请稍后重试';
