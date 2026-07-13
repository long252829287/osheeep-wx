import { OPERATOR_NAME, PRIVACY_EMAIL } from '../../content/legal';

Page({
  data: { operatorName: OPERATOR_NAME, privacyEmail: PRIVACY_EMAIL },

  onOpenUserAgreement() {
    wx.navigateTo({ url: '/pages/legal/user-agreement/index' });
  },

  onOpenPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/legal/privacy-policy/index' });
  },

  onOpenDeletion() {
    wx.navigateTo({ url: '/pages/account-deletion/index' });
  },
});
