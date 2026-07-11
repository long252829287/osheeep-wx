import { ApiError } from '../../services/request';
import type { HouseholdSummary } from '../../types/household';
import { toHouseholdErrorMessage } from '../../utils/household-errors';

interface OsheeepApp {
  joinHousehold: (inviteCode: string) => Promise<HouseholdSummary>;
}

Page({
  data: {
    inviteCode: '',
    submitting: false,
    errorMessage: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.inviteCode) {
      this.setData({ inviteCode: decodeURIComponent(options.inviteCode) });
    }
  },

  onInput(event: WechatMiniprogram.Input) {
    this.setData({
      inviteCode: event.detail.value.toUpperCase(),
      errorMessage: '',
    });
  },

  onPaste() {
    wx.getClipboardData({
      success: (result) =>
        this.setData({
          inviteCode: result.data.trim().toUpperCase(),
          errorMessage: '',
        }),
    });
  },

  async onJoin() {
    if (this.data.submitting) return;
    if (!this.data.inviteCode.trim()) {
      this.setData({ errorMessage: '请输入邀请码' });
      return;
    }
    this.setData({ submitting: true, errorMessage: '' });
    try {
      await getApp<OsheeepApp>().joinHousehold(this.data.inviteCode);
      wx.reLaunch({ url: '/pages/tonight/index' });
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof ApiError
            ? toHouseholdErrorMessage(error.errorCode)
            : '操作失败，请稍后重试',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onGoCreate() {
    wx.redirectTo({ url: '/pages/household-create/index' });
  },
});
