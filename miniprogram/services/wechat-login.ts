export interface LoginOptions {
  success?: (result: { code: string }) => void;
  fail?: (error: { errMsg: string }) => void;
}

export type LoginPort = (options: LoginOptions) => void;

export const requestWechatCode = (login: LoginPort) =>
  new Promise<string>((resolve, reject) => {
    login({
      success: (result) =>
        result.code
          ? resolve(result.code)
          : reject(new Error('微信登录未返回 code')),
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
