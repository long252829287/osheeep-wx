import { requestWechatCode } from '../miniprogram/services/wechat-login';

test('resolves a non-empty code returned by wx.login', async () => {
  await expect(
    requestWechatCode((options) => options.success?.({ code: 'fresh-code' })),
  ).resolves.toBe('fresh-code');
});

test('rejects empty codes and wx.login failures', async () => {
  await expect(
    requestWechatCode((options) => options.success?.({ code: '' })),
  ).rejects.toThrow('微信登录未返回 code');
  await expect(
    requestWechatCode((options) =>
      options.fail?.({ errMsg: 'login:fail denied' }),
    ),
  ).rejects.toThrow('login:fail denied');
});
