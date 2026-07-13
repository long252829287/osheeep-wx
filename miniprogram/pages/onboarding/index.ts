import type { HouseholdSummary } from '../../types/household';
import { resolvePostLoginRoute } from '../../utils/initial-route';
import { hasAcceptedLegalTerms } from '../../utils/onboarding-consent';

interface OsheeepApp {
  loginWithWechat: () => Promise<void>;
  getHousehold: () => Promise<HouseholdSummary | null>;
}

Page({
  data: {
    loading: false,
    agreementAccepted: false,
    errorMessage: '',
  },

  onAgreementChange(event: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({
      agreementAccepted: hasAcceptedLegalTerms(event.detail.value),
      errorMessage: '',
    });
  },

  onOpenUserAgreement() {
    wx.navigateTo({ url: '/pages/legal/user-agreement/index' });
  },

  onOpenPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/legal/privacy-policy/index' });
  },

  async onContinue() {
    if (!this.data.agreementAccepted) return;
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
