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
