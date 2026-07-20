import {
  createRuntimeConfig,
  resolveApiBaseUrl,
} from '../miniprogram/config/runtime-config';

test.each([
  ['develop', 'http://127.0.0.1:8080'],
  ['trial', 'https://www.osheeep.com'],
  ['release', 'https://www.osheeep.com'],
] as const)('maps %s to %s', (envVersion, expected) => {
  expect(resolveApiBaseUrl(envVersion)).toBe(expected);
});

test('creates the native runtime configuration from the mini program environment', () => {
  expect(createRuntimeConfig('develop')).toEqual({
    apiBaseUrl: 'http://127.0.0.1:8080',
  });
});
