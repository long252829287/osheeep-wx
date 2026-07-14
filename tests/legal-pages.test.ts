import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  OPERATOR_NAME,
  PRIVACY_EMAIL,
  PRIVACY_POLICY,
  USER_AGREEMENT,
} from '../miniprogram/content/legal';
import {
  EXPECTED_PRIVACY_POLICY,
  EXPECTED_USER_AGREEMENT,
} from './fixtures/legal-documents';

const root = resolve(__dirname, '..');
const appConfig = JSON.parse(
  readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8'),
) as { pages?: string[] };
const onboardingWxml = readFileSync(
  resolve(root, 'miniprogram/pages/onboarding/index.wxml'),
  'utf8',
);
const onboardingWxss = readFileSync(
  resolve(root, 'miniprogram/pages/onboarding/index.wxss'),
  'utf8',
);
const userAgreementWxml = readFileSync(
  resolve(root, 'miniprogram/pages/legal/user-agreement/index.wxml'),
  'utf8',
);
const privacyPolicyWxml = readFileSync(
  resolve(root, 'miniprogram/pages/legal/privacy-policy/index.wxml'),
  'utf8',
);

interface LegalPageDefinition {
  data: { document: unknown };
}

const loadLegalPage = async (
  modulePath: string,
): Promise<LegalPageDefinition> => {
  const runtime = globalThis as unknown as {
    Page?: (definition: LegalPageDefinition) => void;
  };
  const previousPage = runtime.Page;
  let captured: LegalPageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };

  try {
    await jest.isolateModulesAsync(async () => {
      await import(modulePath);
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured) throw new Error(`Page definition not captured: ${modulePath}`);
  return captured;
};

test('protects the complete exact user agreement copy', () => {
  expect(OPERATOR_NAME).toBe('刘彦龙');
  expect(PRIVACY_EMAIL).toBe('15203700590@163.com');
  expect(USER_AGREEMENT).toEqual(EXPECTED_USER_AGREEMENT);
});

test('protects the complete exact privacy policy copy', () => {
  expect(OPERATOR_NAME).toBe('刘彦龙');
  expect(PRIVACY_EMAIL).toBe('15203700590@163.com');
  expect(PRIVACY_POLICY).toEqual(EXPECTED_PRIVACY_POLICY);
});

test('keeps onboarding first and legal routes adjacent in the required order', () => {
  expect(appConfig.pages?.slice(0, 3)).toEqual([
    'pages/onboarding/index',
    'pages/legal/user-agreement/index',
    'pages/legal/privacy-policy/index',
  ]);
});

test.each([
  'pages/legal/user-agreement/index.ts',
  'pages/legal/user-agreement/index.wxml',
  'pages/legal/user-agreement/index.wxss',
  'pages/legal/user-agreement/index.json',
  'pages/legal/privacy-policy/index.ts',
  'pages/legal/privacy-policy/index.wxml',
  'pages/legal/privacy-policy/index.wxss',
  'pages/legal/privacy-policy/index.json',
])('contains native legal page file %s', (file) => {
  expect(existsSync(resolve(root, 'miniprogram', file))).toBe(true);
});

test('loads the matching document in each native legal page', async () => {
  expect(
    (await loadLegalPage('../miniprogram/pages/legal/user-agreement/index'))
      .data.document,
  ).toEqual(EXPECTED_USER_AGREEMENT);
  expect(
    (await loadLegalPage('../miniprogram/pages/legal/privacy-policy/index'))
      .data.document,
  ).toEqual(EXPECTED_PRIVACY_POLICY);
});

test.each([
  ['user agreement', userAgreementWxml],
  ['privacy policy', privacyPolicyWxml],
])(
  'renders the %s from local document bindings without web-view',
  (_, wxml) => {
    expect(wxml).not.toContain('<web-view');
    expect(wxml).toContain('{{document.title}}');
    expect(wxml).toContain('wx:for="{{document.sections}}"');
    expect(wxml).toContain('wx:for="{{item.paragraphs}}"');
    expect(wxml).toContain('{{paragraph}}');
  },
);

test('keeps explicit consent bindings and legal links outside the checkbox', () => {
  expect(onboardingWxml).toContain(
    '<checkbox-group class="agreement" bindchange="onAgreementChange">',
  );
  expect(onboardingWxml).toContain('value="accepted"');
  expect(onboardingWxml).toContain(
    'disabled="{{loading || !agreementAccepted}}"',
  );
  expect(onboardingWxml.indexOf('</checkbox-group>')).toBeLessThan(
    onboardingWxml.indexOf('<view class="legal-links">'),
  );
  expect(onboardingWxml).not.toContain('<web-view');
});

test('uses native legal controls with usable touch targets', () => {
  expect(onboardingWxml).toContain(
    '<button class="legal-link" plain catchtap="onOpenUserAgreement">',
  );
  expect(onboardingWxml).toContain(
    '<button class="legal-link" plain catchtap="onOpenPrivacyPolicy">',
  );
  const legalLinkRule = onboardingWxss.match(
    /\.legal-link \{(?<declarations>[\s\S]*?)\}/,
  )?.groups?.declarations;
  expect(legalLinkRule).toContain('min-height: 88rpx;');
  expect(legalLinkRule).toContain('padding: 12rpx 16rpx;');
});
