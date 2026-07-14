import { ApiError } from '../../services/request';
import { toAccountDeletionErrorMessage } from '../../utils/account-errors';

interface OsheeepApp {
  deleteAccount: () => Promise<void>;
}

Page({
  data: {
    understood: false,
    confirming: false,
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
    if (!this.data.understood || this.data.confirming || this.data.submitting)
      return;
    this.setData({ confirming: true, errorMessage: '' });
    wx.showModal({
      title: '确认退出当前小家？',
      content:
        '仍有其他家庭成员时，你将退出家庭，共享历史会以“已注销成员”保留；如果你是最后一名成员，家庭及全部晚餐数据将被删除。',
      confirmText: '继续',
      confirmColor: '#B83B2F',
      success: (result) => {
        if (result.confirm) {
          this.showFinalDeletionConfirmation();
          return;
        }
        this.setData({ confirming: false });
      },
      fail: () => this.setData({ confirming: false }),
    });
  },

  showFinalDeletionConfirmation() {
    wx.showModal({
      title: '最终确认注销账号',
      content:
        '旧账号注销后不可恢复；再次使用需要重新进行微信授权并创建新账号。',
      confirmText: '永久注销',
      confirmColor: '#B83B2F',
      success: (result) => {
        if (result.confirm) {
          void this.performDeletion();
          return;
        }
        this.setData({ confirming: false });
      },
      fail: () => this.setData({ confirming: false }),
    });
  },

  async performDeletion() {
    if (this.data.submitting) return;
    this.setData({ confirming: false, submitting: true, errorMessage: '' });
    try {
      await getApp<OsheeepApp>().deleteAccount();
      wx.reLaunch({ url: '/pages/onboarding/index' });
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'UNAUTHORIZED') {
        wx.reLaunch({ url: '/pages/onboarding/index' });
        return;
      }
      this.setData({
        errorMessage:
          error instanceof ApiError
            ? toAccountDeletionErrorMessage(error.errorCode)
            : '注销失败，请稍后重试',
      });
    } finally {
      this.setData({ confirming: false, submitting: false });
    }
  },
});
