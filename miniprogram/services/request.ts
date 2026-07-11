import type { ApiResponse, RequestInit } from '../types/api';

export interface RequestResult {
  statusCode: number;
  data: unknown;
}

export interface RequestOptions {
  url: string;
  method: NonNullable<RequestInit['method']>;
  data?: unknown;
  header?: Record<string, string>;
  success?: (result: RequestResult) => void;
  fail?: (error: { errMsg: string }) => void;
}

export interface RequestPort {
  request(options: RequestOptions): void;
}

export class ApiError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const createRequestClient = (options: {
  request: RequestPort;
  apiBaseUrl: string;
  getAccessToken: () => string | undefined;
  onUnauthorized?: () => void;
}) => ({
  request: <T>(path: string, init: RequestInit = {}) =>
    new Promise<T>((resolve, reject) => {
      const token = options.getAccessToken();
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      options.request.request({
        url: `${options.apiBaseUrl}${path}`,
        method: init.method ?? 'GET',
        data: init.data,
        header: {
          'X-Request-Id': requestId,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        success: (result) => {
          const body = result.data as ApiResponse<T>;
          if (result.statusCode === 401) {
            options.onUnauthorized?.();
          }
          if (
            result.statusCode >= 200 &&
            result.statusCode < 300 &&
            body.success
          ) {
            resolve(body.data as T);
            return;
          }
          reject(
            new ApiError(
              body.errorCode ?? 'UNKNOWN_ERROR',
              body.message ?? '请求失败',
              body.requestId,
            ),
          );
        },
        fail: (error) => reject(new ApiError('NETWORK_ERROR', error.errMsg)),
      });
    }),
});
