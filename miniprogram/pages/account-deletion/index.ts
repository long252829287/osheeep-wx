import { ApiError } from '../../services/request';
import { toAccountDeletionErrorMessage } from '../../utils/account-errors';

interface OsheeepApp {
  deleteAccount: () => Promise<void>;
}

Page({
  data: {
    understood: false,
    submitting: false,
    errorMessage: '',
  },

  onUnderstandingChange(event: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({
      understood: event.detail.value.includes('understood'),
      errorMessage: '',
    });
  },

  onRequestDeletion() {
    if (!this.data.understood || this.data.submitting) return;
    wx.showModal({
      title: '确认注销账号？',
      content: '注销后原账号和历史关联无法恢复。',
      confirmText: '确认注销',
      confirmColor: '#B83B2F',
      success: (result) => {
        if (result.confirm) void this.performDeletion();
      },
    });
  },

  async performDeletion() {
    this.setData({ submitting: true, errorMessage: '' });
    try {
      await getApp<OsheeepApp>().deleteAccount();
      wx.reLaunch({ url: '/pages/onboarding/index' });
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof ApiError
            ? toAccountDeletionErrorMessage(error.errorCode)
            : '注销失败，请稍后重试',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
