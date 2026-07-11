interface OsheeepApp {
  loginWithWechat: () => Promise<void>;
}

Page({
  data: {
    loading: false,
    errorMessage: '',
  },

  async onContinue() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      await getApp<OsheeepApp>().loginWithWechat();
      wx.showToast({ title: '登录成功', icon: 'success' });
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
