import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

test('declares the native mini program source directory', () => {
  const project = JSON.parse(
    readFileSync(resolve(root, 'project.config.json'), 'utf8'),
  ) as { miniprogramRoot?: string };

  expect(project.miniprogramRoot).toBe('miniprogram/');
  expect(existsSync(resolve(root, 'miniprogram/app.json'))).toBe(true);
});

test('declares every dinner menu route and bundled recipe image', () => {
  const appConfig = JSON.parse(
    readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8'),
  ) as { pages?: string[] };

  expect(appConfig.pages).toEqual(
    expect.arrayContaining([
      'pages/tonight/index',
      'pages/recipes/index',
      'pages/records/index',
      'pages/record-detail/index',
      'pages/profile/index',
    ]),
  );

  for (const slug of [
    'tomato-eggs',
    'stir-fried-beef',
    'sauteed-lettuce',
    'braised-chicken-rice',
    'seaweed-egg-soup',
    'cola-chicken-wings',
    'garlic-broccoli',
    'pepper-potato',
  ]) {
    expect(
      existsSync(resolve(root, `miniprogram/assets/recipes/${slug}.jpg`)),
    ).toBe(true);
  }
});

test('declares the household ingredient inventory page', () => {
  const app = JSON.parse(
    readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8'),
  ) as { pages?: string[] };

  expect(app.pages).toContain('pages/ingredients/index');
  expect(
    existsSync(resolve(root, 'miniprogram/pages/ingredients/index.ts')),
  ).toBe(true);
});

test('declares the household recipe list as a native page route', () => {
  const app = JSON.parse(
    readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8'),
  ) as { pages?: string[] };

  expect(app.pages).toContain('pages/family-recipes/index');
  for (const extension of ['json', 'ts', 'wxml', 'wxss']) {
    expect(
      existsSync(
        resolve(root, `miniprogram/pages/family-recipes/index.${extension}`),
      ),
    ).toBe(true);
  }
});

test('declares a valid default sitemap rule for upload', () => {
  const sitemap = JSON.parse(
    readFileSync(resolve(root, 'miniprogram/sitemap.json'), 'utf8'),
  ) as { rules?: Array<{ action?: string; page?: string }> };

  expect(sitemap.rules).toEqual([{ action: 'allow', page: '*' }]);
});

test.each([
  'miniprogram/app.ts',
  'miniprogram/app.wxss',
  'miniprogram/sitemap.json',
  'miniprogram/pages/onboarding/index.json',
  'miniprogram/pages/onboarding/index.ts',
  'miniprogram/pages/onboarding/index.wxml',
  'miniprogram/pages/onboarding/index.wxss',
])('contains required runtime file %s', (file) => {
  expect(existsSync(resolve(root, file))).toBe(true);
});

test('uses the approved product name in runtime surfaces', () => {
  const project = readFileSync(resolve(root, 'project.config.json'), 'utf8');
  const app = readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8');
  const onboardingConfig = readFileSync(
    resolve(root, 'miniprogram/pages/onboarding/index.json'),
    'utf8',
  );
  const onboarding = readFileSync(
    resolve(root, 'miniprogram/pages/onboarding/index.wxml'),
    'utf8',
  );
  const household = readFileSync(
    resolve(root, 'miniprogram/pages/household-create/index.wxml'),
    'utf8',
  );

  expect(project).toContain('"projectname": "小家开饭"');
  expect(app).toContain('"navigationBarTitleText": "小家开饭"');
  expect(onboardingConfig).toContain('"navigationBarTitleText": "小家开饭"');
  expect(onboarding).toContain(
    '<view class="brand" aria-label="小家开饭">小家开饭</view>',
  );
  expect(onboarding).toContain('<text class="title-me">今晚吃什么，</text>');
  expect(household).toContain('<text class="eyebrow">小家开饭</text>');
  expect(onboarding).not.toContain('双人协商桌');
  expect(household).not.toContain('双人协商桌');
});
