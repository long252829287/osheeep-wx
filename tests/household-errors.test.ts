import { toHouseholdErrorMessage } from '../miniprogram/utils/household-errors';

test.each([
  ['DINNER_INVITE_INVALID', '邀请码无效，请检查后重试'],
  ['DINNER_INVITE_EXPIRED', '邀请码已过期，请让 TA 重新生成'],
  ['DINNER_HOUSEHOLD_FULL', '这个小家已经有两个人了'],
  ['DINNER_ALREADY_IN_HOUSEHOLD', '你已经加入一个小家了'],
  ['NETWORK_ERROR', '网络连接失败，请稍后重试'],
] as const)('maps %s to user-facing copy', (errorCode, expected) => {
  expect(toHouseholdErrorMessage(errorCode)).toBe(expected);
});

test('uses a safe fallback for unknown errors', () => {
  expect(toHouseholdErrorMessage('UNKNOWN')).toBe('操作失败，请稍后重试');
});
