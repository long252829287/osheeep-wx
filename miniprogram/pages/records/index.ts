import type { RecordSummary } from '../../types/record';

interface OsheeepApp {
  getRecords: () => Promise<RecordSummary[]>;
}

Page({
  data: {
    loading: true,
    records: [] as RecordSummary[],
    errorMessage: '',
  },

  async onShow() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const records = await getApp<OsheeepApp>().getRecords();
      this.setData({ records });
    } catch {
      this.setData({ errorMessage: '做饭记录加载失败，请稍后重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onOpenRecord(event: WechatMiniprogram.TouchEvent) {
    const id = Number(event.currentTarget.dataset.id);
    wx.navigateTo({ url: `/pages/record-detail/index?id=${id}` });
  },
});
