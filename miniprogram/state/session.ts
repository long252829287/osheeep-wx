const ACCESS_TOKEN_KEY = 'osheeep.accessToken';

export interface StoragePort {
  getStorageSync<T>(key: string): T | undefined;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
}

export const sessionStore = (storage: StoragePort) => ({
  getAccessToken: () => storage.getStorageSync<string>(ACCESS_TOKEN_KEY),
  setAccessToken: (token: string) =>
    storage.setStorageSync(ACCESS_TOKEN_KEY, token),
  clear: () => storage.removeStorageSync(ACCESS_TOKEN_KEY),
});
