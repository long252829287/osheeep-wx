# Osheeep 微信小程序前端基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建可导入微信开发者工具、可运行严格类型检查与 Jest 测试的原生 TypeScript 小程序骨架，并完成会话、请求、微信登录入口的可测试边界。

**Architecture:** 小程序运行文件位于 `miniprogram/`，平台无关逻辑通过依赖注入隔离 `wx` 全局，Jest 只测试纯 TypeScript 模块。首屏只实现已批准的首次进入视觉结构；真实后端未接通前不伪造成功登录、家庭或菜单数据。

**Tech Stack:** 微信原生小程序、TypeScript 5.9.3、Jest 29.7.0、ts-jest 29.4.11、miniprogram-api-typings 5.2.1、ESLint 9、Prettier 3。

## Global Constraints

- 前端必须使用微信原生 TypeScript、WXML、WXSS、JSON，不引入 Taro、uni-app、React、Vue 或 MobX。
- 公共 `project.config.json` 使用 `touristappid`；真实 AppID 只写入被 Git 忽略的 `project.private.config.json`。
- API 根地址开发默认值为 `http://127.0.0.1:8080`，不得提交 AppSecret、令牌或生产凭据。
- `wx.request` 响应必须映射现有 `ApiResponse<T>`：`success`、`errorCode`、`message`、`data`、`requestId`。
- 任何业务函数先看到目标测试失败，再写最小实现；配置文件和纯视觉 WXML/WXSS 不要求单独单测。
- 本阶段只实现工程基础与登录入口，不实现家庭、菜谱、今晚菜单和做饭记录。

---

### Task 1: 工程工具链与结构契约

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.cjs`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `project.config.json`
- Create: `tests/project-structure.test.ts`

**Interfaces:**
- Consumes: Node.js 22 和 npm 11。
- Produces: `npm test`、`npm run typecheck`、`npm run lint`、`npm run format:check`；微信开发者工具从 `miniprogram/` 读取源码。

- [x] **Step 1: 写失败的工程结构测试**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

test('declares the native mini program source directory', () => {
  const project = JSON.parse(readFileSync(resolve(root, 'project.config.json'), 'utf8'));
  expect(project.miniprogramRoot).toBe('miniprogram/');
  expect(existsSync(resolve(root, 'miniprogram/app.json'))).toBe(true);
});
```

- [x] **Step 2: 安装依赖并运行测试，确认因 `miniprogram/app.json` 不存在而失败**

Run: `npm install && npm test -- tests/project-structure.test.ts --runInBand`

Expected: FAIL，断言 `existsSync(.../miniprogram/app.json)` 收到 `false`。

- [x] **Step 3: 写最小工具链配置**

```json
{
  "name": "osheeep-wx",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"miniprogram/**/*.ts\" \"tests/**/*.ts\" --no-error-on-unmatched-pattern",
    "format:check": "prettier --check \"**/*.{ts,json,md}\""
  },
  "devDependencies": {
    "@types/jest": "29.5.14",
    "@types/node": "22.15.30",
    "eslint": "9.39.1",
    "jest": "29.7.0",
    "miniprogram-api-typings": "5.2.1",
    "prettier": "3.9.4",
    "ts-jest": "29.4.11",
    "typescript": "5.9.3",
    "typescript-eslint": "8.62.1"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "noImplicitAny": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["miniprogram-api-typings", "jest", "node"]
  },
  "include": ["miniprogram/**/*.ts", "tests/**/*.ts"]
}
```

```js
// jest.config.cjs
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  clearMocks: true,
};
```

```js
// eslint.config.mjs
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['coverage/**', 'miniprogram_npm/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
);
```

`.prettierrc.json` 使用 `{ "singleQuote": true, "trailingComma": "all" }`；`project.config.json` 设置 `miniprogramRoot: "miniprogram/"`、`compileType: "miniprogram"`、`appid: "touristappid"` 和 TypeScript 编译插件；`.gitignore` 忽略 `node_modules/`、`coverage/`、`miniprogram_npm/`、`project.private.config.json`。

- [x] **Step 4: 创建最小 `miniprogram/app.json` 并验证工程契约**

```json
{
  "pages": ["pages/onboarding/index"],
  "window": {
    "navigationBarTitleText": "今晚吃什么",
    "navigationBarBackgroundColor": "#FFF8EE",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#FFF8EE"
  },
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}
```

Run: `npm test -- tests/project-structure.test.ts --runInBand`

Expected: PASS，1 test passed。

- [x] **Step 5: 提交工程工具链**

```bash
git add .gitignore package.json package-lock.json tsconfig.json jest.config.cjs eslint.config.mjs .prettierrc.json project.config.json tests/project-structure.test.ts miniprogram/app.json
git commit -m "chore: scaffold native mini program toolchain"
```

### Task 2: 运行环境与会话存储

**Files:**
- Create: `miniprogram/config/environment.ts`
- Create: `miniprogram/state/session.ts`
- Create: `tests/session.test.ts`

**Interfaces:**
- Consumes: `StoragePort`，签名为 `getStorageSync<T>(key: string): T | undefined`、`setStorageSync(key: string, value: unknown): void`、`removeStorageSync(key: string): void`。
- Produces: `sessionStore(storage)`，包含 `getAccessToken()`、`setAccessToken(token)`、`clear()`；常量 `runtimeConfig.apiBaseUrl`。

- [x] **Step 1: 写失败的会话测试**

```ts
import { sessionStore, type StoragePort } from '../miniprogram/state/session';

test('stores and clears the access token through the storage port', () => {
  const values = new Map<string, unknown>();
  const storage: StoragePort = {
    getStorageSync: <T>(key: string) => values.get(key) as T | undefined,
    setStorageSync: (key, value) => values.set(key, value),
    removeStorageSync: (key) => values.delete(key),
  };
  const session = sessionStore(storage);

  session.setAccessToken('token-1');
  expect(session.getAccessToken()).toBe('token-1');
  session.clear();
  expect(session.getAccessToken()).toBeUndefined();
});
```

- [x] **Step 2: 运行测试，确认模块缺失**

Run: `npm test -- tests/session.test.ts --runInBand`

Expected: FAIL，Cannot find module `../miniprogram/state/session`。

- [x] **Step 3: 实现最小会话存储**

```ts
const ACCESS_TOKEN_KEY = 'osheeep.accessToken';

export interface StoragePort {
  getStorageSync<T>(key: string): T | undefined;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
}

export const sessionStore = (storage: StoragePort) => ({
  getAccessToken: () => storage.getStorageSync<string>(ACCESS_TOKEN_KEY),
  setAccessToken: (token: string) => storage.setStorageSync(ACCESS_TOKEN_KEY, token),
  clear: () => storage.removeStorageSync(ACCESS_TOKEN_KEY),
});
```

`environment.ts` 只导出 `{ apiBaseUrl: 'http://127.0.0.1:8080' } as const`。

- [x] **Step 4: 验证会话测试和类型检查**

Run: `npm test -- tests/session.test.ts --runInBand && npm run typecheck`

Expected: PASS，类型检查退出码 0。

- [x] **Step 5: 提交会话边界**

```bash
git add miniprogram/config/environment.ts miniprogram/state/session.ts tests/session.test.ts
git commit -m "feat: add runtime config and session storage"
```

### Task 3: 统一 API 请求客户端

**Files:**
- Create: `miniprogram/types/api.ts`
- Create: `miniprogram/services/request.ts`
- Create: `tests/request.test.ts`

**Interfaces:**
- Consumes: `RequestPort.request(options)`、`apiBaseUrl`、可选访问令牌和 `onUnauthorized`。
- Produces: `createRequestClient(options).request<T>(path, init)`；成功返回 `data`，业务失败抛出 `ApiError`，401 先执行 `onUnauthorized`。

- [x] **Step 1: 写失败的请求映射测试**

```ts
import { ApiError, createRequestClient, type RequestPort } from '../miniprogram/services/request';

test('adds auth headers and unwraps successful ApiResponse data', async () => {
  const request: RequestPort = {
    request: (options) => {
      expect(options.url).toBe('https://api.test/api/dinner/household');
      expect(options.header?.Authorization).toBe('Bearer token-1');
      options.success?.({ statusCode: 200, data: { success: true, data: { id: 7 }, requestId: 'r-1' } });
    },
  };
  const client = createRequestClient({ request, apiBaseUrl: 'https://api.test', getAccessToken: () => 'token-1' });

  await expect(client.request<{ id: number }>('/api/dinner/household')).resolves.toEqual({ id: 7 });
});

test('clears session before exposing an unauthorized error', async () => {
  let unauthorized = false;
  const request: RequestPort = {
    request: (options) => options.success?.({ statusCode: 401, data: { success: false, errorCode: 'UNAUTHORIZED', message: '登录已过期', requestId: 'r-2' } }),
  };
  const client = createRequestClient({ request, apiBaseUrl: 'https://api.test', getAccessToken: () => 'expired', onUnauthorized: () => { unauthorized = true; } });

  await expect(client.request('/api/dinner/household')).rejects.toEqual(expect.objectContaining({ errorCode: 'UNAUTHORIZED', requestId: 'r-2' }));
  expect(unauthorized).toBe(true);
});
```

- [x] **Step 2: 运行测试，确认请求模块缺失**

Run: `npm test -- tests/request.test.ts --runInBand`

Expected: FAIL，Cannot find module `../miniprogram/services/request`。

- [x] **Step 3: 实现最小请求客户端**

```ts
// miniprogram/types/api.ts
export interface ApiResponse<T> {
  success: boolean;
  errorCode?: string;
  message?: string;
  data?: T;
  requestId?: string;
}

export interface RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: string | Record<string, unknown> | ArrayBuffer;
}
```

```ts
// miniprogram/services/request.ts
import type { ApiResponse, RequestInit } from '../types/api';

interface RequestResult {
  statusCode: number;
  data: unknown;
}

interface RequestOptions {
  url: string;
  method: NonNullable<RequestInit['method']>;
  data?: RequestInit['data'];
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
          if (result.statusCode === 401) options.onUnauthorized?.();
          if (result.statusCode >= 200 && result.statusCode < 300 && body.success && body.data !== undefined) {
            resolve(body.data);
            return;
          }
          reject(new ApiError(body.errorCode ?? 'UNKNOWN_ERROR', body.message ?? '请求失败', body.requestId));
        },
        fail: (error) => reject(new ApiError('NETWORK_ERROR', error.errMsg)),
      });
    }),
});
```

- [x] **Step 4: 验证请求行为**

Run: `npm test -- tests/request.test.ts --runInBand && npm run typecheck`

Expected: PASS，3 个请求相关断言全部通过，类型检查退出码 0。

- [x] **Step 5: 提交请求客户端**

```bash
git add miniprogram/types/api.ts miniprogram/services/request.ts tests/request.test.ts
git commit -m "feat: add typed api request client"
```

### Task 4: 微信登录服务与初始路由决策

**Files:**
- Create: `miniprogram/types/auth.ts`
- Create: `miniprogram/services/auth-service.ts`
- Create: `miniprogram/utils/initial-route.ts`
- Create: `tests/auth-service.test.ts`
- Create: `tests/initial-route.test.ts`

**Interfaces:**
- Consumes: `LoginPort.login()`、Task 3 的 `requestClient.request<T>()`、Task 2 的 `session.setAccessToken()`。
- Produces: `createAuthService(...).loginWithWechat()`；`resolveInitialRoute(hasToken, hasHousehold): '/pages/onboarding/index' | '/pages/household-create/index' | '/pages/tonight/index'`。

- [x] **Step 1: 写失败的登录服务和路由测试**

```ts
import { createAuthService } from '../miniprogram/services/auth-service';

test('exchanges wx login code and stores the returned token', async () => {
  const setAccessToken = jest.fn();
  const service = createAuthService({
    login: (options) => options.success?.({ code: 'wx-code' }),
    request: async (_path, init) => {
      expect(init?.data).toEqual({ code: 'wx-code' });
      return { accessToken: 'jwt-1' };
    },
    setAccessToken,
  });
  await service.loginWithWechat();
  expect(setAccessToken).toHaveBeenCalledWith('jwt-1');
});
```

```ts
import { resolveInitialRoute } from '../miniprogram/utils/initial-route';

test.each([
  [false, false, '/pages/onboarding/index'],
  [true, false, '/pages/household-create/index'],
  [true, true, '/pages/tonight/index'],
] as const)('maps token=%s household=%s to %s', (hasToken, hasHousehold, expected) => {
  expect(resolveInitialRoute(hasToken, hasHousehold)).toBe(expected);
});
```

- [x] **Step 2: 运行测试，确认模块缺失**

Run: `npm test -- tests/auth-service.test.ts tests/initial-route.test.ts --runInBand`

Expected: FAIL，两个目标模块均不存在。

- [x] **Step 3: 实现微信登录交换和路由函数**

```ts
// miniprogram/types/auth.ts
export interface AuthToken {
  accessToken: string;
}
```

```ts
// miniprogram/services/auth-service.ts
import type { AuthToken } from '../types/auth';
import type { RequestInit } from '../types/api';

interface LoginOptions {
  success?: (result: { code: string }) => void;
  fail?: (error: { errMsg: string }) => void;
}

export interface LoginPort {
  login(options: LoginOptions): void;
}

export const createAuthService = (options: {
  login: LoginPort['login'];
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  setAccessToken: (token: string) => void;
}) => ({
  loginWithWechat: async () => {
    const code = await new Promise<string>((resolve, reject) => {
      options.login({
        success: (result) => result.code ? resolve(result.code) : reject(new Error('微信登录未返回 code')),
        fail: (error) => reject(new Error(error.errMsg)),
      });
    });
    const token = await options.request<AuthToken>('/api/auth/wechat', {
      method: 'POST',
      data: { code },
    });
    if (!token.accessToken) throw new Error('登录响应缺少访问令牌');
    options.setAccessToken(token.accessToken);
    return token;
  },
});
```

```ts
// miniprogram/utils/initial-route.ts
export const resolveInitialRoute = (hasToken: boolean, hasHousehold: boolean) => {
  if (!hasToken) return '/pages/onboarding/index' as const;
  return hasHousehold ? '/pages/tonight/index' as const : '/pages/household-create/index' as const;
};
```

- [x] **Step 4: 验证登录和路由**

Run: `npm test -- tests/auth-service.test.ts tests/initial-route.test.ts --runInBand && npm run typecheck`

Expected: PASS，登录交换、错误传播和三种路由分支全部通过。

- [x] **Step 5: 提交登录服务**

```bash
git add miniprogram/types/auth.ts miniprogram/services/auth-service.ts miniprogram/utils/initial-route.ts tests/auth-service.test.ts tests/initial-route.test.ts
git commit -m "feat: add wechat login service"
```

### Task 5: 小程序启动文件与首次进入页

**Files:**
- Create: `miniprogram/app.ts`
- Create: `miniprogram/app.wxss`
- Create: `miniprogram/sitemap.json`
- Create: `miniprogram/pages/onboarding/index.json`
- Create: `miniprogram/pages/onboarding/index.ts`
- Create: `miniprogram/pages/onboarding/index.wxml`
- Create: `miniprogram/pages/onboarding/index.wxss`
- Modify: `tests/project-structure.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: Task 2 的 session store、Task 3 的 request client、Task 4 的 auth service；视觉基线 `docs/design/onboarding-first-entry.png`。
- Produces: 可由微信开发者工具打开的首次进入页；按钮点击时调用真实 `wx.login` 和 `/api/auth/wechat`，失败保持当前页并展示错误，成功后保存令牌。家庭检查与跳转在下一阶段接入家庭接口时实现。

- [x] **Step 1: 扩展失败的启动文件契约测试**

```ts
test.each([
  'miniprogram/app.ts',
  'miniprogram/app.wxss',
  'miniprogram/sitemap.json',
  'miniprogram/pages/onboarding/index.ts',
  'miniprogram/pages/onboarding/index.wxml',
  'miniprogram/pages/onboarding/index.wxss',
])('contains required runtime file %s', (file) => {
  expect(existsSync(resolve(root, file))).toBe(true);
});
```

- [x] **Step 2: 运行测试，确认启动文件缺失**

Run: `npm test -- tests/project-structure.test.ts --runInBand`

Expected: FAIL，首个缺失的运行文件断言收到 `false`。

- [x] **Step 3: 实现最小启动文件和首次进入页**

```ts
// miniprogram/app.ts
import { runtimeConfig } from './config/environment';
import { createAuthService } from './services/auth-service';
import { createRequestClient } from './services/request';
import { sessionStore } from './state/session';

const session = sessionStore({
  getStorageSync: <T>(key: string) => wx.getStorageSync<T>(key),
  setStorageSync: (key, value) => wx.setStorageSync(key, value),
  removeStorageSync: (key) => wx.removeStorageSync(key),
});
const requestClient = createRequestClient({
  request: { request: (options) => wx.request(options as WechatMiniprogram.RequestOption) },
  apiBaseUrl: runtimeConfig.apiBaseUrl,
  getAccessToken: session.getAccessToken,
  onUnauthorized: session.clear,
});
const auth = createAuthService({
  login: (options) => wx.login(options),
  request: requestClient.request,
  setAccessToken: session.setAccessToken,
});

App({
  loginWithWechat: async () => {
    await auth.loginWithWechat();
  },
});
```

```ts
// miniprogram/pages/onboarding/index.ts
Page({
  data: { loading: false, errorMessage: '' },
  async onContinue() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const app = getApp<{ loginWithWechat: () => Promise<void> }>();
      await app.loginWithWechat();
    } catch (error) {
      this.setData({ errorMessage: error instanceof Error ? error.message : '登录失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
```

```xml
<view class="page">
  <view class="eyebrow">两个人的晚餐协商桌</view>
  <view class="hero">
    <text class="title">今晚吃什么</text>
    <text class="subtitle">你选你想吃的，TA 选 TA 想吃的，交给小程序合成今晚菜单。</text>
  </view>
  <view class="steps">
    <view class="step"><text class="step-index step-index--me">01</text><text>各自选菜</text></view>
    <view class="step"><text class="step-index step-index--together">02</text><text>找到共同想吃</text></view>
    <view class="step"><text class="step-index step-index--partner">03</text><text>确认并留下记录</text></view>
  </view>
  <view class="footer">
    <text wx:if="{{errorMessage}}" class="error">{{errorMessage}}</text>
    <button class="primary" loading="{{loading}}" disabled="{{loading}}" bindtap="onContinue">微信登录并继续</button>
    <text class="privacy">登录只用于识别你和伴侣，不会自动获取手机号或相册。</text>
  </view>
</view>
```

`index.wxss` 使用 `#FFF8EE` 页面背景、`#E8753D` 主按钮、`#4E7FA8` 伴侣步骤和 `padding-bottom: calc(32rpx + env(safe-area-inset-bottom))`；不添加伪造插画、emoji、手绘 SVG 或虚构头像。

- [x] **Step 4: 运行全量验证**

Run: `npm test -- --runInBand && npm run typecheck && npm run lint && npm run format:check`

Expected: 所有测试 PASS；TypeScript、ESLint、Prettier 均以退出码 0 完成。

- [x] **Step 5: 提交可运行首屏**

```bash
git add miniprogram tests/project-structure.test.ts README.md
git commit -m "feat: add mini program onboarding shell"
```

## 阶段验收

- 微信开发者工具可从仓库根目录读取 `project.config.json`，并将 `miniprogram/` 作为源码目录。
- `npm test -- --runInBand`、`npm run typecheck`、`npm run lint`、`npm run format:check` 全部通过。
- 公共仓库中不存在 AppSecret、真实 AppID、访问令牌或生产凭据。
- 首次进入页与 `docs/design/onboarding-first-entry.png` 的信息层级一致；真实后端不可用时明确报错，不伪造成功状态。
- 完成本计划后再创建“家庭创建与加入”实施计划。
