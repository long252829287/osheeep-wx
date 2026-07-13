import {
  createRequestClient,
  type RequestPort,
} from '../miniprogram/services/request';

test('adds auth headers and unwraps successful ApiResponse data', async () => {
  const request: RequestPort = {
    request: (options) => {
      expect(options.url).toBe('https://api.test/api/dinner/household');
      expect(options.header?.Authorization).toBe('Bearer token-1');
      expect(options.header?.['X-Request-Id']).toEqual(expect.any(String));
      options.success?.({
        statusCode: 200,
        data: {
          success: true,
          data: { id: 7 },
          requestId: 'r-1',
        },
      });
    },
  };
  const client = createRequestClient({
    request,
    apiBaseUrl: 'https://api.test',
    getAccessToken: () => 'token-1',
  });

  await expect(
    client.request<{ id: number }>('/api/dinner/household'),
  ).resolves.toEqual({ id: 7 });
});

test('unwraps a successful ApiResponse without data as undefined', async () => {
  const request: RequestPort = {
    request: (options) =>
      options.success?.({
        statusCode: 200,
        data: { success: true },
      }),
  };
  const client = createRequestClient({
    request,
    apiBaseUrl: 'https://api.test',
    getAccessToken: () => 'token-1',
  });

  await expect(
    client.request<void>('/api/users/me/deletion', { method: 'POST' }),
  ).resolves.toBeUndefined();
});

test('clears session before exposing an unauthorized error', async () => {
  const events: string[] = [];
  const request: RequestPort = {
    request: (options) =>
      options.success?.({
        statusCode: 401,
        data: {
          success: false,
          errorCode: 'UNAUTHORIZED',
          message: '登录已过期',
          requestId: 'r-2',
        },
      }),
  };
  const client = createRequestClient({
    request,
    apiBaseUrl: 'https://api.test',
    getAccessToken: () => 'expired',
    onUnauthorized: () => events.push('cleared'),
  });

  await expect(client.request('/api/dinner/household')).rejects.toEqual(
    expect.objectContaining({
      errorCode: 'UNAUTHORIZED',
      requestId: 'r-2',
    }),
  );
  expect(events).toEqual(['cleared']);
});

test('maps transport failures to NETWORK_ERROR', async () => {
  const request: RequestPort = {
    request: (options) => options.fail?.({ errMsg: 'request:fail timeout' }),
  };
  const client = createRequestClient({
    request,
    apiBaseUrl: 'https://api.test',
    getAccessToken: () => undefined,
  });

  await expect(client.request('/health')).rejects.toEqual(
    expect.objectContaining({
      errorCode: 'NETWORK_ERROR',
      message: 'request:fail timeout',
    }),
  );
});
