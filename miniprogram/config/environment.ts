export type MiniProgramEnvVersion = 'develop' | 'trial' | 'release';

export const resolveApiBaseUrl = (envVersion: MiniProgramEnvVersion) =>
  envVersion === 'develop'
    ? 'http://127.0.0.1:8080'
    : 'https://www.osheeep.com';

export const createRuntimeConfig = (envVersion: MiniProgramEnvVersion) => ({
  apiBaseUrl: resolveApiBaseUrl(envVersion),
});
