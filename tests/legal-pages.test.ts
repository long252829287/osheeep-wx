import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const appConfig = JSON.parse(
  readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8'),
) as { pages?: string[] };
const onboardingWxml = readFileSync(
  resolve(root, 'miniprogram/pages/onboarding/index.wxml'),
  'utf8',
);
const onboardingTs = readFileSync(
  resolve(root, 'miniprogram/pages/onboarding/index.ts'),
  'utf8',
);
const legalContent = readFileSync(
  resolve(root, 'miniprogram/content/legal.ts'),
  'utf8',
);

test('declares public legal routes and explicit onboarding consent', () => {
  expect(appConfig.pages).toEqual(
    expect.arrayContaining([
      'pages/legal/user-agreement/index',
      'pages/legal/privacy-policy/index',
    ]),
  );
  expect(onboardingWxml).toContain('checkbox-group');
  expect(onboardingWxml).toContain('value="accepted"');
  expect(onboardingWxml).toContain(
    'disabled="{{loading || !agreementAccepted}}"',
  );
  expect(onboardingTs).toContain('if (!this.data.agreementAccepted) return;');
  expect(legalContent).toContain("export const OPERATOR_NAME = '个人主体姓名'");
  expect(legalContent).toContain(
    "export const PRIVACY_EMAIL = '15203700590@163.com'",
  );
});
