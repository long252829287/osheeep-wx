import { createRuntimeConfig } from './config/environment';
import { createAuthService, type LoginPort } from './services/auth-service';
import { createAccountService } from './services/account-service';
import { createHouseholdService } from './services/household-service';
import { createMenuService } from './services/menu-service';
import { createRecipeService } from './services/recipe-service';
import { createRecordService } from './services/record-service';
import { createRequestClient, type RequestPort } from './services/request';
import { sessionStore } from './state/session';

const runtimeConfig = createRuntimeConfig(
  wx.getAccountInfoSync().miniProgram.envVersion,
);

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

const loginPort: { login: LoginPort } = {
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
const accountService = createAccountService({
  login: loginPort.login,
  request: requestClient.request,
  clearSession: session.clear,
});
const householdService = createHouseholdService({
  request: requestClient.request,
});
const menuService = createMenuService({ request: requestClient.request });
const recipeService = createRecipeService({ request: requestClient.request });
const recordService = createRecordService({ request: requestClient.request });

App({
  loginWithWechat: async () => {
    await authService.loginWithWechat();
  },
  deleteAccount: accountService.deleteAccount,
  getHousehold: householdService.getCurrent,
  createHousehold: householdService.create,
  refreshInviteCode: householdService.refreshInviteCode,
  joinHousehold: householdService.join,
  getRecipes: recipeService.list,
  getTodayMenu: menuService.getToday,
  saveSelections: menuService.saveSelections,
  confirmTodayMenu: menuService.confirm,
  completeTodayMenu: menuService.complete,
  getRecords: recordService.list,
  getRecord: recordService.detail,
});
