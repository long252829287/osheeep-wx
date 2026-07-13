import type { RequestInit } from '../types/api';
import { requestWechatCode, type LoginPort } from './wechat-login';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

export const createAccountService = (options: {
  login: LoginPort;
  request: RequestFunction;
  clearSession: () => void;
}) => ({
  deleteAccount: async () => {
    const code = await requestWechatCode(options.login);
    await options.request<void>('/api/users/me/deletion', {
      method: 'POST',
      data: { code },
    });
    options.clearSession();
  },
});
