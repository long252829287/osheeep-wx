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
