import { hasAcceptedLegalTerms } from '../miniprogram/utils/onboarding-consent';

test('accepts only the explicit accepted checkbox value', () => {
  expect(hasAcceptedLegalTerms([])).toBe(false);
  expect(hasAcceptedLegalTerms(['other'])).toBe(false);
  expect(hasAcceptedLegalTerms(['accepted'])).toBe(true);
});
