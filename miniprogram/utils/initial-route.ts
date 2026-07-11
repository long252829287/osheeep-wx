export type InitialRoute =
  | '/pages/onboarding/index'
  | '/pages/household-create/index'
  | '/pages/tonight/index';

export const resolveInitialRoute = (
  hasToken: boolean,
  hasHousehold: boolean,
): InitialRoute => {
  if (!hasToken) {
    return '/pages/onboarding/index';
  }
  return hasHousehold
    ? '/pages/tonight/index'
    : '/pages/household-create/index';
};
