/**
 * 离线二维码小程序
 * 发送（生成二维码）/ 接收（扫码识别）/ 历史记录
 */
App({
  onLaunch: function () {
    // 记录本次启动，便于排查
    this.globalData.launchedAt = Date.now();
  },

  globalData: {
    launchedAt: 0,
    // 三个页面之间共享“最近一次内容”
    lastContent: '',
  },
});
