interface OnboardingData {
  loading: boolean;
  agreementAccepted: boolean;
  errorMessage: string;
}

interface OnboardingInstance {
  data: OnboardingData;
  setData(update: Partial<OnboardingData>): void;
}

interface OnboardingPageDefinition {
  data: OnboardingData;
  onAgreementChange(
    this: OnboardingInstance,
    event: { detail: { value: string[] } },
  ): void;
  onOpenUserAgreement(this: OnboardingInstance): void;
  onOpenPrivacyPolicy(this: OnboardingInstance): void;
  onContinue(this: OnboardingInstance): Promise<void>;
}

const runtime = globalThis as unknown as {
  Page?: (definition: OnboardingPageDefinition) => void;
  getApp?: () => {
    loginWithWechat: jest.Mock<Promise<void>, []>;
    getHousehold: jest.Mock<Promise<null>, []>;
  };
  wx?: {
    navigateTo: jest.Mock;
    reLaunch: jest.Mock;
  };
};

const originalGetApp = runtime.getApp;
const originalWx = runtime.wx;

const loadOnboardingPage = async (): Promise<OnboardingPageDefinition> => {
  const previousPage = runtime.Page;
  let captured: OnboardingPageDefinition | undefined;
  runtime.Page = (definition) => {
    captured = definition;
  };

  try {
    await jest.isolateModulesAsync(async () => {
      await import('../miniprogram/pages/onboarding/index');
    });
  } finally {
    if (previousPage) runtime.Page = previousPage;
    else delete runtime.Page;
  }

  if (!captured) throw new Error('Onboarding Page definition was not captured');
  return captured;
};

const createInstance = (
  definition: OnboardingPageDefinition,
): OnboardingInstance => ({
  data: { ...definition.data },
  setData(update) {
    Object.assign(this.data, update);
  },
});

afterEach(() => {
  if (originalGetApp) runtime.getApp = originalGetApp;
  else delete runtime.getApp;
  if (originalWx) runtime.wx = originalWx;
  else delete runtime.wx;
});

test('defaults to unaccepted and never logs in without explicit consent', async () => {
  const definition = await loadOnboardingPage();
  const instance = createInstance(definition);
  const loginWithWechat = jest.fn<Promise<void>, []>().mockResolvedValue();
  runtime.getApp = () => ({
    loginWithWechat,
    getHousehold: jest.fn<Promise<null>, []>().mockResolvedValue(null),
  });
  runtime.wx = { navigateTo: jest.fn(), reLaunch: jest.fn() };

  expect(instance.data.agreementAccepted).toBe(false);
  await definition.onContinue.call(instance);

  expect(loginWithWechat).not.toHaveBeenCalled();
  expect(runtime.wx.reLaunch).not.toHaveBeenCalled();
});

test('logs in exactly once after the accepted checkbox value is selected', async () => {
  const definition = await loadOnboardingPage();
  const instance = createInstance(definition);
  const loginWithWechat = jest.fn<Promise<void>, []>().mockResolvedValue();
  runtime.getApp = () => ({
    loginWithWechat,
    getHousehold: jest.fn<Promise<null>, []>().mockResolvedValue(null),
  });
  runtime.wx = { navigateTo: jest.fn(), reLaunch: jest.fn() };

  definition.onAgreementChange.call(instance, {
    detail: { value: ['accepted'] },
  });
  await definition.onContinue.call(instance);

  expect(instance.data.agreementAccepted).toBe(true);
  expect(loginWithWechat).toHaveBeenCalledTimes(1);
  expect(runtime.wx.reLaunch).toHaveBeenCalledWith({
    url: '/pages/household-create/index',
  });
});

test.each([
  ['onOpenUserAgreement', '/pages/legal/user-agreement/index'],
  ['onOpenPrivacyPolicy', '/pages/legal/privacy-policy/index'],
] as const)(
  '%s only navigates and never changes consent',
  async (handler, url) => {
    const definition = await loadOnboardingPage();
    const instance = createInstance(definition);
    runtime.wx = { navigateTo: jest.fn(), reLaunch: jest.fn() };

    definition[handler].call(instance);

    expect(runtime.wx.navigateTo).toHaveBeenCalledTimes(1);
    expect(runtime.wx.navigateTo).toHaveBeenCalledWith({ url });
    expect(instance.data.agreementAccepted).toBe(false);
  },
);
