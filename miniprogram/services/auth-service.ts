import type { AuthToken } from '../types/auth';
import type { RequestInit } from '../types/api';
import { requestWechatCode, type LoginPort } from './wechat-login';

export type { LoginPort } from './wechat-login';

export const createAuthService = (options: {
  login: LoginPort;
  request: (path: string, init?: RequestInit) => Promise<AuthToken>;
  setAccessToken: (token: string) => void;
}) => ({
  loginWithWechat: async () => {
    const code = await requestWechatCode(options.login);
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
