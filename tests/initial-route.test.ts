import { resolveInitialRoute } from '../miniprogram/utils/initial-route';

test.each([
  [false, false, '/pages/onboarding/index'],
  [true, false, '/pages/household-create/index'],
  [true, true, '/pages/tonight/index'],
] as const)(
  'maps token=%s household=%s to %s',
  (hasToken, hasHousehold, expected) => {
    expect(resolveInitialRoute(hasToken, hasHousehold)).toBe(expected);
  },
);
