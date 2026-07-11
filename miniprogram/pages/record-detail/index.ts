import type { RecordDetail } from '../../types/record';

interface OsheeepApp {
  getRecord: (recordId: number) => Promise<RecordDetail>;
}

Page({
  data: {
    loading: true,
    record: null as RecordDetail | null,
    errorMessage: '',
  },

  async onLoad(query: Record<string, string | undefined>) {
    const recordId = Number(query.id);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      this.setData({ loading: false, errorMessage: '这条记录不存在' });
      return;
    }

    try {
      const record = await getApp<OsheeepApp>().getRecord(recordId);
      this.setData({ record });
    } catch {
      this.setData({ errorMessage: '晚餐详情加载失败，请稍后重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBackToTonight() {
    wx.reLaunch({ url: '/pages/tonight/index' });
  },

  onBackToRecords() {
    wx.reLaunch({ url: '/pages/records/index' });
  },
});
