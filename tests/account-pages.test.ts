import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from '../miniprogram/services/request';

const root = resolve(__dirname, '..');
const readProjectFile = (path: string) => {
  const absolutePath = resolve(root, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
};

interface DeletionData {
  understood: boolean;
  confirming: boolean;
  submitting: boolean;
  errorMessage: string;
}

interface DeletionInstance {
  data: DeletionData;
  setData(update: Partial<DeletionData>): void;
  showFinalDeletionConfirmation(): void;
  performDeletion(): Promise<void>;
}

interface DeletionPageDefinition {
  data: DeletionData;
  onUnderstandingChange(
    this: DeletionInstance,
    event: { detail: { value: string[] } },
  ): void;
  onRequestDeletion(this: DeletionInstance): void;
  showFinalDeletionConfirmation(this: DeletionInstance): void;
  performDeletion(this: DeletionInstance): Promise<void>;
}

interface NavigationPageDefinition {
  onOpenUserAgreement?(): void;
  onOpenPrivacyPolicy?(): void;
  onOpenDeletion?(): void;
  onOpenPrivacyCenter?(): void;
}

interface ModalResult {
  confirm: boolean;
  cancel: boolean;
}

interface ModalOptions {
  title: string;
  content: string;
  confirmText: string;
  success?: (result: ModalResult) => void;
  fail?: () => void;
}

const runtime = globalThis as unknown as {
  Page?: (definition: unknown) => void;
  getApp?: () => { deleteAccount: jest.Mock<Promise<void>, []> };
  wx?: {
    showModal: jest.Mock;
    navigateTo: jest.Mock;
    reLaunch: jest.Mock;
  };
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;
const capturedPages = new Map<string, unknown>();

const loadPage = async <T>(modulePath: string): Promise<T> => {
  const cached = capturedPages.get(modulePath);
  if (cached) return cached as T;

  const previousPage = runtime.Page;
  let captured: T | undefined;
  runtime.Page = (definition) => {
    captured = definition as T;
  };

  try {
    await import(modulePath);
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured) throw new Error(`Page definition not captured: ${modulePath}`);
  capturedPages.set(modulePath, captured);
  return captured;
};

const createDeletionInstance = (
  definition: DeletionPageDefinition,
): DeletionInstance => ({
  data: { ...definition.data },
  setData(update) {
    Object.assign(this.data, update);
  },
  showFinalDeletionConfirmation: definition.showFinalDeletionConfirmation,
  performDeletion: definition.performDeletion,
});

const flushPromises = () =>
  new Promise<void>((resolvePromise) => setImmediate(resolvePromise));

afterEach(() => {
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('registers privacy and account deletion routes with required page contracts', () => {
  const appConfig = JSON.parse(readProjectFile('miniprogram/app.json')) as {
    pages: string[];
  };
  const profileWxml = readProjectFile('miniprogram/pages/profile/index.wxml');
  const deletionWxml = readProjectFile(
    'miniprogram/pages/account-deletion/index.wxml',
  );
  const deletionTs = readProjectFile(
    'miniprogram/pages/account-deletion/index.ts',
  );
  const deletionWxss = readProjectFile(
    'miniprogram/pages/account-deletion/index.wxss',
  );

  expect(appConfig.pages).toEqual(
    expect.arrayContaining([
      'pages/privacy-center/index',
      'pages/account-deletion/index',
    ]),
  );
  expect(profileWxml).toContain('隐私与账户');
  expect(deletionWxml).toContain(
    '仍有其他家庭成员时，你会退出家庭，共享历史以“已注销成员”保留',
  );
  expect(deletionWxml).toContain(
    '你是最后一名成员时，家庭及全部晚餐数据会被删除',
  );
  expect(deletionWxml).toContain('旧账号不可恢复');
  expect(deletionWxml).toContain('再次使用需重新进行微信授权并创建新账号');
  expect(deletionWxml).toContain('checkbox');
  expect(deletionWxml).toContain(
    'disabled="{{!understood || confirming || submitting}}"',
  );
  expect(deletionTs.match(/wx\.showModal/g)).toHaveLength(2);
  expect(deletionTs).toContain('await getApp<OsheeepApp>().deleteAccount()');
  expect(deletionTs).toContain(
    "wx.reLaunch({ url: '/pages/onboarding/index' })",
  );
  expect(
    deletionWxss.match(/\.understanding-row \{(?<declarations>[\s\S]*?)\}/)
      ?.groups?.declarations,
  ).toContain('min-height: 88rpx;');
  expect(
    deletionWxss.match(/\.understanding-row \{(?<declarations>[\s\S]*?)\}/)
      ?.groups?.declarations,
  ).toMatch(/padding: [^;]+;/);
});

test('keeps the privacy entry reachable outside the household conditional', () => {
  const profileWxml = readProjectFile('miniprogram/pages/profile/index.wxml');
  expect(profileWxml).toMatch(
    /<\/view>\s*<button class="privacy-entry" bindtap="onOpenPrivacyCenter">/,
  );
});

test.each([
  [
    '../miniprogram/pages/privacy-center/index',
    'onOpenUserAgreement',
    '/pages/legal/user-agreement/index',
  ],
  [
    '../miniprogram/pages/privacy-center/index',
    'onOpenPrivacyPolicy',
    '/pages/legal/privacy-policy/index',
  ],
  [
    '../miniprogram/pages/privacy-center/index',
    'onOpenDeletion',
    '/pages/account-deletion/index',
  ],
  [
    '../miniprogram/pages/profile/index',
    'onOpenPrivacyCenter',
    '/pages/privacy-center/index',
  ],
] as const)('%s %s navigates to %s', async (modulePath, handler, url) => {
  const definition = await loadPage<NavigationPageDefinition>(modulePath);
  runtime.wx = {
    showModal: jest.fn(),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };

  definition[handler]?.();

  expect(runtime.wx.navigateTo).toHaveBeenCalledWith({ url });
});

test('requires the checkbox and prevents a second chain while the first modal waits', async () => {
  const definition = await loadPage<DeletionPageDefinition>(
    '../miniprogram/pages/account-deletion/index',
  );
  const instance = createDeletionInstance(definition);
  const deleteAccount = jest.fn<Promise<void>, []>().mockResolvedValue();
  runtime.getApp = () => ({ deleteAccount });
  runtime.wx = {
    showModal: jest.fn(),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };

  definition.onRequestDeletion.call(instance);
  expect(runtime.wx.showModal).not.toHaveBeenCalled();

  definition.onUnderstandingChange.call(instance, {
    detail: { value: ['understood'] },
  });
  definition.onRequestDeletion.call(instance);
  definition.onRequestDeletion.call(instance);

  expect(runtime.wx.showModal).toHaveBeenCalledTimes(1);
  expect(instance.data.confirming).toBe(true);
  const modal = runtime.wx.showModal.mock.calls[0][0] as ModalOptions;
  expect(modal.title).toBe('确认退出当前小家？');
  expect(modal.content).toContain('共享历史会以“已注销成员”保留');
  expect(modal.content).toContain('家庭及全部晚餐数据将被删除');

  modal.success?.({ confirm: false, cancel: true });
  await flushPromises();

  expect(deleteAccount).not.toHaveBeenCalled();
  expect(runtime.wx.reLaunch).not.toHaveBeenCalled();
  expect(instance.data.confirming).toBe(false);
});

test('stops after the second modal is cancelled', async () => {
  const definition = await loadPage<DeletionPageDefinition>(
    '../miniprogram/pages/account-deletion/index',
  );
  const instance = createDeletionInstance(definition);
  const deleteAccount = jest.fn<Promise<void>, []>().mockResolvedValue();
  runtime.getApp = () => ({ deleteAccount });
  runtime.wx = {
    showModal: jest.fn(),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };

  definition.onUnderstandingChange.call(instance, {
    detail: { value: ['understood'] },
  });
  definition.onRequestDeletion.call(instance);
  const firstModal = runtime.wx.showModal.mock.calls[0][0] as ModalOptions;
  firstModal.success?.({ confirm: true, cancel: false });

  expect(runtime.wx.showModal).toHaveBeenCalledTimes(2);
  const finalModal = runtime.wx.showModal.mock.calls[1][0] as ModalOptions;
  expect(finalModal.title).toBe('最终确认注销账号');
  expect(finalModal.content).toContain('旧账号注销后不可恢复');
  expect(finalModal.content).toContain('重新进行微信授权并创建新账号');
  expect(finalModal.confirmText).toBe('永久注销');
  finalModal.success?.({ confirm: false, cancel: true });
  await flushPromises();

  expect(deleteAccount).not.toHaveBeenCalled();
  expect(runtime.wx.reLaunch).not.toHaveBeenCalled();
  expect(instance.data.confirming).toBe(false);
});

test('deletes once only after both modals are confirmed and returns to onboarding', async () => {
  const definition = await loadPage<DeletionPageDefinition>(
    '../miniprogram/pages/account-deletion/index',
  );
  const instance = createDeletionInstance(definition);
  const deleteAccount = jest.fn<Promise<void>, []>().mockResolvedValue();
  runtime.getApp = () => ({ deleteAccount });
  runtime.wx = {
    showModal: jest.fn(),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };

  definition.onUnderstandingChange.call(instance, {
    detail: { value: ['understood'] },
  });
  definition.onRequestDeletion.call(instance);
  const firstModal = runtime.wx.showModal.mock.calls[0][0] as ModalOptions;
  firstModal.success?.({ confirm: true, cancel: false });
  expect(deleteAccount).not.toHaveBeenCalled();
  const finalModal = runtime.wx.showModal.mock.calls[1][0] as ModalOptions;
  finalModal.success?.({ confirm: true, cancel: false });
  await flushPromises();

  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(runtime.wx.reLaunch).toHaveBeenCalledTimes(1);
  expect(runtime.wx.reLaunch).toHaveBeenCalledWith({
    url: '/pages/onboarding/index',
  });
  expect(instance.data.submitting).toBe(false);
  expect(instance.data.confirming).toBe(false);
});

test.each(['first', 'second'] as const)(
  'restores the confirmation state when the %s modal fails',
  async (stage) => {
    const definition = await loadPage<DeletionPageDefinition>(
      '../miniprogram/pages/account-deletion/index',
    );
    const instance = createDeletionInstance(definition);
    const deleteAccount = jest.fn<Promise<void>, []>().mockResolvedValue();
    runtime.getApp = () => ({ deleteAccount });
    runtime.wx = {
      showModal: jest.fn(),
      navigateTo: jest.fn(),
      reLaunch: jest.fn(),
    };

    definition.onUnderstandingChange.call(instance, {
      detail: { value: ['understood'] },
    });
    definition.onRequestDeletion.call(instance);
    const firstModal = runtime.wx.showModal.mock.calls[0][0] as ModalOptions;
    if (stage === 'second') {
      firstModal.success?.({ confirm: true, cancel: false });
    }
    expect(runtime.wx.showModal).toHaveBeenCalledTimes(
      stage === 'first' ? 1 : 2,
    );
    const failedModal = runtime.wx.showModal.mock.calls[
      stage === 'first' ? 0 : 1
    ][0] as ModalOptions;
    failedModal.fail?.();

    expect(instance.data.confirming).toBe(false);
    expect(instance.data.submitting).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();
  },
);

test('keeps the user in place and shows a stable non-auth API error', async () => {
  const definition = await loadPage<DeletionPageDefinition>(
    '../miniprogram/pages/account-deletion/index',
  );
  const instance = createDeletionInstance(definition);
  const deleteAccount = jest
    .fn<Promise<void>, []>()
    .mockRejectedValue(
      new ApiError('ACCOUNT_DELETION_IDENTITY_MISMATCH', 'mismatch'),
    );
  runtime.getApp = () => ({ deleteAccount });
  runtime.wx = {
    showModal: jest.fn(),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };

  definition.onUnderstandingChange.call(instance, {
    detail: { value: ['understood'] },
  });
  definition.onRequestDeletion.call(instance);
  const firstModal = runtime.wx.showModal.mock.calls[0][0] as ModalOptions;
  firstModal.success?.({ confirm: true, cancel: false });
  expect(runtime.wx.showModal).toHaveBeenCalledTimes(2);
  const finalModal = runtime.wx.showModal.mock.calls[1][0] as ModalOptions;
  finalModal.success?.({ confirm: true, cancel: false });
  await flushPromises();

  expect(runtime.wx.reLaunch).not.toHaveBeenCalled();
  expect(instance.data.errorMessage).toBe(
    '当前微信身份与登录账号不一致，无法注销',
  );
  expect(instance.data.submitting).toBe(false);
  expect(instance.data.confirming).toBe(false);
});

test('redirects an unauthorized deletion failure to onboarding', async () => {
  const definition = await loadPage<DeletionPageDefinition>(
    '../miniprogram/pages/account-deletion/index',
  );
  const instance = createDeletionInstance(definition);
  const deleteAccount = jest
    .fn<Promise<void>, []>()
    .mockRejectedValue(new ApiError('UNAUTHORIZED', 'expired'));
  runtime.getApp = () => ({ deleteAccount });
  runtime.wx = {
    showModal: jest.fn(),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };

  definition.onUnderstandingChange.call(instance, {
    detail: { value: ['understood'] },
  });
  definition.onRequestDeletion.call(instance);
  const firstModal = runtime.wx.showModal.mock.calls[0][0] as ModalOptions;
  firstModal.success?.({ confirm: true, cancel: false });
  expect(runtime.wx.showModal).toHaveBeenCalledTimes(2);
  const finalModal = runtime.wx.showModal.mock.calls[1][0] as ModalOptions;
  finalModal.success?.({ confirm: true, cancel: false });
  await flushPromises();

  expect(runtime.wx.reLaunch).toHaveBeenCalledWith({
    url: '/pages/onboarding/index',
  });
  expect(instance.data.errorMessage).toBe('');
  expect(instance.data.submitting).toBe(false);
  expect(instance.data.confirming).toBe(false);
});

test('guards both entry and performDeletion while deletion is submitting', async () => {
  const definition = await loadPage<DeletionPageDefinition>(
    '../miniprogram/pages/account-deletion/index',
  );
  const instance = createDeletionInstance(definition);
  let resolveDeletion: (() => void) | undefined;
  const deleteAccount = jest.fn<Promise<void>, []>(
    () =>
      new Promise<void>((resolvePromise) => {
        resolveDeletion = resolvePromise;
      }),
  );
  runtime.getApp = () => ({ deleteAccount });
  runtime.wx = {
    showModal: jest.fn(),
    navigateTo: jest.fn(),
    reLaunch: jest.fn(),
  };

  definition.onUnderstandingChange.call(instance, {
    detail: { value: ['understood'] },
  });
  definition.onRequestDeletion.call(instance);
  const firstModal = runtime.wx.showModal.mock.calls[0][0] as ModalOptions;
  firstModal.success?.({ confirm: true, cancel: false });
  expect(runtime.wx.showModal).toHaveBeenCalledTimes(2);
  const finalModal = runtime.wx.showModal.mock.calls[1][0] as ModalOptions;
  finalModal.success?.({ confirm: true, cancel: false });
  expect(instance.data.submitting).toBe(true);

  definition.onRequestDeletion.call(instance);
  await definition.performDeletion.call(instance);
  expect(runtime.wx.showModal).toHaveBeenCalledTimes(2);
  expect(deleteAccount).toHaveBeenCalledTimes(1);

  resolveDeletion?.();
  await flushPromises();
});
