import type { HouseholdSummary } from '../../types/household';
import { resolvePostLoginRoute } from '../../utils/initial-route';

interface OsheeepApp {
  loginWithWechat: () => Promise<void>;
  getHousehold: () => Promise<HouseholdSummary | null>;
}

Page({
  data: {
    loading: false,
    errorMessage: '',
  },

  async onContinue() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const app = getApp<OsheeepApp>();
      await app.loginWithWechat();
      const url = await resolvePostLoginRoute(app.getHousehold);
      wx.reLaunch({ url });
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof Error ? error.message : '登录失败，请稍后重试',
      });
    } finally {
      this.setData({ loading: false });
    }
  },
});
