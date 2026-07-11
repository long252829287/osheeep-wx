import { runtimeConfig } from './config/environment';
import { createAuthService, type LoginPort } from './services/auth-service';
import { createRequestClient, type RequestPort } from './services/request';
import { sessionStore } from './state/session';

const session = sessionStore({
  getStorageSync: <T>(key: string) => wx.getStorageSync<T>(key),
  setStorageSync: (key, value) => wx.setStorageSync(key, value),
  removeStorageSync: (key) => wx.removeStorageSync(key),
});

const requestPort: RequestPort = {
  request: (options) => {
    wx.request({
      url: options.url,
      method: options.method,
      data: options.data,
      header: options.header,
      success: (result) =>
        options.success?.({
          statusCode: result.statusCode,
          data: result.data,
        }),
      fail: (error) => options.fail?.({ errMsg: error.errMsg }),
    });
  },
};

const loginPort: LoginPort = {
  login: (options) => {
    wx.login({
      success: (result) => options.success?.({ code: result.code }),
      fail: (error) => options.fail?.({ errMsg: error.errMsg }),
    });
  },
};

const requestClient = createRequestClient({
  request: requestPort,
  apiBaseUrl: runtimeConfig.apiBaseUrl,
  getAccessToken: session.getAccessToken,
  onUnauthorized: session.clear,
});
const authService = createAuthService({
  login: loginPort.login,
  request: requestClient.request,
  setAccessToken: session.setAccessToken,
});

App({
  loginWithWechat: async () => {
    await authService.loginWithWechat();
  },
});
