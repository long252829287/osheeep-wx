import { resolveApiBaseUrl } from '../miniprogram/config/environment';

test.each([
  ['develop', 'http://127.0.0.1:8080'],
  ['trial', 'https://www.osheeep.com'],
  ['release', 'https://www.osheeep.com'],
] as const)('maps %s to %s', (envVersion, expected) => {
  expect(resolveApiBaseUrl(envVersion)).toBe(expected);
});
