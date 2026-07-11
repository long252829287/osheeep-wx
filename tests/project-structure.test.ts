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
