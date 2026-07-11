import {
  resolveInitialRoute,
  resolvePostLoginRoute,
} from '../miniprogram/utils/initial-route';

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

test('checks household state after login before choosing a route', async () => {
  await expect(resolvePostLoginRoute(async () => null)).resolves.toBe(
    '/pages/household-create/index',
  );
  await expect(resolvePostLoginRoute(async () => ({ id: 11 }))).resolves.toBe(
    '/pages/tonight/index',
  );
});
