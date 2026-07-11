import { ApiError } from '../../services/request';
import type {
  HouseholdCreatedResult,
  HouseholdSummary,
} from '../../types/household';
import { toHouseholdErrorMessage } from '../../utils/household-errors';

interface OsheeepApp {
  getHousehold: () => Promise<HouseholdSummary | null>;
  createHousehold: (name?: string) => Promise<HouseholdCreatedResult>;
  refreshInviteCode: () => Promise<HouseholdCreatedResult>;
}

Page({
  data: {
    state: 'loading' as 'loading' | 'idle' | 'existing' | 'created',
    submitting: false,
    householdName: '我们的小家',
    inviteCode: '',
    inviteExpiresAt: '',
    errorMessage: '',
  },

  async onLoad() {
    try {
      const household = await getApp<OsheeepApp>().getHousehold();
      this.setData({
        state: household ? 'existing' : 'idle',
        householdName: household?.name ?? '我们的小家',
      });
    } catch (error) {
      this.setData({ state: 'idle', errorMessage: this.errorMessage(error) });
    }
  },

  async onCreate() {
    if (this.data.submitting) return;
    this.setData({ submitting: true, errorMessage: '' });
    try {
      const app = getApp<OsheeepApp>();
      const result =
        this.data.state === 'existing'
          ? await app.refreshInviteCode()
          : await app.createHousehold('我们的小家');
      this.showCreated(result);
    } catch (error) {
      this.setData({ errorMessage: this.errorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onGoJoin() {
    wx.navigateTo({ url: '/pages/household-join/index' });
  },

  onCopyInvite() {
    if (!this.data.inviteCode) return;
    wx.setClipboardData({ data: this.data.inviteCode });
  },

  onEnterTonight() {
    wx.reLaunch({ url: '/pages/tonight/index' });
  },

  onShareAppMessage() {
    return {
      title: '加入我们的小家，一起决定今晚吃什么',
      path: `/pages/household-join/index?inviteCode=${encodeURIComponent(this.data.inviteCode)}`,
    };
  },

  showCreated(result: HouseholdCreatedResult) {
    this.setData({
      state: 'created',
      householdName: result.household.name,
      inviteCode: result.inviteCode,
      inviteExpiresAt: result.inviteExpiresAt,
    });
  },

  errorMessage(error: unknown) {
    return error instanceof ApiError
      ? toHouseholdErrorMessage(error.errorCode)
      : '操作失败，请稍后重试';
  },
});
