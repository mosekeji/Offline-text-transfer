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

    /** 开源仓库地址 */
    onCopyRepo: function () {
      this.copyAddress('https://github.com/mosekeji/Offline-text-transfer', '开源地址已复制');
    },

    /** Releases 下载地址 */
    onCopyReleases: function () {
      this.copyAddress('https://github.com/mosekeji/Offline-text-transfer/releases', '下载地址已复制');
    },

    /** Gitee 开源仓库地址 */
    onCopyGiteeRepo: function () {
      this.copyAddress('https://gitee.com/mstf/Offline-text-transfer', 'Gitee 开源地址已复制');
    },

    /** Gitee Releases 下载地址 */
    onCopyGiteeReleases: function () {
      this.copyAddress('https://gitee.com/mstf/Offline-text-transfer/releases', 'Gitee 下载地址已复制');
    },

    /** 小程序内无法直接打开外部链接，统一用「复制到剪贴板」 */
    copyAddress: function (url, tip) {
      wx.setClipboardData({
        data: url,
        success: function () {
          wx.showToast({ title: tip, icon: 'none' });
        },
      });
    },

    /** 遮罩上滑动时拦截穿透 */
    noop: function () {},
  },
});
