import { sessionStore, type StoragePort } from '../miniprogram/state/session';

test('stores and clears the access token through the storage port', () => {
  const values = new Map<string, unknown>();
  const storage: StoragePort = {
    getStorageSync: <T>(key: string) => values.get(key) as T | undefined,
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: (key) => values.delete(key),
  };
  const session = sessionStore(storage);

  session.setAccessToken('token-1');
  expect(session.getAccessToken()).toBe('token-1');
  session.clear();
  expect(session.getAccessToken()).toBeUndefined();
});
