import { toAccountDeletionErrorMessage } from '../miniprogram/utils/account-errors';

test.each([
  [
    'ACCOUNT_DELETION_IDENTITY_MISMATCH',
    '当前微信身份与登录账号不一致，无法注销',
  ],
  ['WECHAT_LOGIN_FAILED', '微信身份验证失败，请重新尝试'],
  ['NETWORK_ERROR', '网络连接失败，请稍后重试'],
])('maps %s', (code, message) => {
  expect(toAccountDeletionErrorMessage(code)).toBe(message);
});

test('maps expired sessions and unknown errors to stable messages', () => {
  expect(toAccountDeletionErrorMessage('UNAUTHORIZED')).toBe(
    '登录状态已失效，请重新登录',
  );
  expect(toAccountDeletionErrorMessage('UNKNOWN_ERROR')).toBe(
    '注销失败，请稍后重试',
  );
});
