import type { HouseholdSummary } from '../../types/household';

interface OsheeepApp {
  getHousehold: () => Promise<HouseholdSummary | null>;
}

Page({
  data: {
    loading: true,
    household: null as HouseholdSummary | null,
    errorMessage: '',
  },

  async onShow() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const household = await getApp<OsheeepApp>().getHousehold();
      this.setData({ household });
    } catch {
      this.setData({ errorMessage: '小家信息加载失败，请稍后重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onInvitePartner() {
    wx.navigateTo({ url: '/pages/household-create/index' });
  },
});
