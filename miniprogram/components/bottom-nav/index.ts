const routes: Record<string, string> = {
  tonight: '/pages/tonight/index',
  recipes: '/pages/recipes/index',
  records: '/pages/records/index',
  profile: '/pages/profile/index',
};

Component({
  properties: {
    active: {
      type: String,
      value: 'tonight',
    },
  },

  methods: {
    onNavigate(event: WechatMiniprogram.TouchEvent) {
      const key = event.currentTarget.dataset.key as string;
      const url = routes[key];
      if (!url || key === this.data.active) return;
      wx.reLaunch({ url });
    },
  },
});
