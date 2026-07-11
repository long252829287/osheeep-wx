import { createAuthService } from '../miniprogram/services/auth-service';

test('exchanges wx login code and stores the returned token', async () => {
  const setAccessToken = jest.fn();
  const service = createAuthService({
    login: (options) => options.success?.({ code: 'wx-code' }),
    request: async (_path, init) => {
      expect(init).toEqual({
        method: 'POST',
        data: { code: 'wx-code' },
      });
      return { accessToken: 'jwt-1' };
    },
    setAccessToken,
  });

  await expect(service.loginWithWechat()).resolves.toEqual({
    accessToken: 'jwt-1',
  });
  expect(setAccessToken).toHaveBeenCalledWith('jwt-1');
});

test('exposes wx login failures without calling the api', async () => {
  const request = jest.fn();
  const service = createAuthService({
    login: (options) => options.fail?.({ errMsg: 'login:fail denied' }),
    request,
    setAccessToken: jest.fn(),
  });

  await expect(service.loginWithWechat()).rejects.toThrow('login:fail denied');
  expect(request).not.toHaveBeenCalled();
});
