import type { AuthToken } from '../types/auth';
import type { RequestInit } from '../types/api';

export interface LoginOptions {
  success?: (result: { code: string }) => void;
  fail?: (error: { errMsg: string }) => void;
}

export interface LoginPort {
  login(options: LoginOptions): void;
}

export const createAuthService = (options: {
  login: LoginPort['login'];
  request: (path: string, init?: RequestInit) => Promise<AuthToken>;
  setAccessToken: (token: string) => void;
}) => ({
  loginWithWechat: async () => {
    const code = await new Promise<string>((resolve, reject) => {
      options.login({
        success: (result) =>
          result.code
            ? resolve(result.code)
            : reject(new Error('微信登录未返回 code')),
        fail: (error) => reject(new Error(error.errMsg)),
      });
    });
    const token = await options.request('/api/auth/wechat', {
      method: 'POST',
      data: { code },
    });
    if (!token.accessToken) {
      throw new Error('登录响应缺少访问令牌');
    }
    options.setAccessToken(token.accessToken);
    return token;
  },
});
