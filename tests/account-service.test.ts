import { createAccountService } from '../miniprogram/services/account-service';

test('uses a fresh code and clears session only after deletion succeeds', async () => {
  const clearSession = jest.fn();
  const request = jest.fn().mockResolvedValue(undefined);
  const service = createAccountService({
    login: (options) => options.success?.({ code: 'fresh-code' }),
    request,
    clearSession,
  });

  await service.deleteAccount();

  expect(request).toHaveBeenCalledWith('/api/users/me/deletion', {
    method: 'POST',
    data: { code: 'fresh-code' },
  });
  expect(clearSession).toHaveBeenCalledTimes(1);
});

test('keeps the session when deletion fails', async () => {
  const clearSession = jest.fn();
  const service = createAccountService({
    login: (options) => options.success?.({ code: 'fresh-code' }),
    request: jest.fn().mockRejectedValue(new Error('server failed')),
    clearSession,
  });

  await expect(service.deleteAccount()).rejects.toThrow('server failed');
  expect(clearSession).not.toHaveBeenCalled();
});
