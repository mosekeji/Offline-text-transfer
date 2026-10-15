/* ==================== 关于：悬浮按钮 + 使用说明弹窗 ==================== */
Component({
  data: {
    opened: false,
  },

  pageLifetimes: {
    /** 切到别的页面（含切后台）时自动收起，回来不残留 */
    hide: function () {
      if (this.data.opened) {
        this.setData({ opened: false });
      }
    },
  },

  methods: {
    onOpen: function () {
      if (this.data.opened) { return; }
      this.setData({ opened: true });
    },

    onClose: function () {
      if (!this.data.opened) { return; }
      this.setData({ opened: false });
    },

    /** 遮罩上滑动时拦截穿透 */
    noop: function () {},
  },
});
