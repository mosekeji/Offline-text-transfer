/* ==================== 接收模式：扫码识别 ==================== */
var history = require('../../utils/history.js');

Page({
  data: {
    result: '',
    hasResult: false,
    resultTime: '',
    scanning: false,
  },

  onLoad: function () {
    var app = getApp();
    if (app.globalData.lastContent) {
      this.setData({ result: app.globalData.lastContent, hasResult: true });
    }
  },

  /** 摄像头扫码 */
  onScanCamera: function () {
    this.doScan({
      onlyFromCamera: true,
      scanType: ['qrCode'],
    });
  },

  /** 从相册选图识别（微信原生支持，无需自研解码） */
  onScanAlbum: function () {
    this.doScan({
      onlyFromCamera: false,
      scanType: ['qrCode'],
    });
  },

  doScan: function (options) {
    var that = this;
    this.setData({ scanning: true });
    wx.scanCode({
      onlyFromCamera: !!options.onlyFromCamera,
      scanType: options.scanType || ['qrCode'],
      success: function (res) {
        that.setData({ scanning: false });
        var text = res.result || '';
        if (!text) {
          wx.showToast({ title: '没有识别到内容', icon: 'none' });
          return;
        }
        that.accept(text);
      },
      fail: function (err) {
        that.setData({ scanning: false });
        var msg = (err && err.errMsg) || '';
        if (msg.indexOf('cancel') >= 0) { return; }   // 用户主动取消，不打扰
        if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
          wx.showModal({
            title: '需要摄像头权限',
            content: '扫码需要摄像头权限，请在设置中开启后重试。',
            confirmText: '去设置',
            success: function (r) { if (r.confirm) { wx.openSetting(); } },
          });
          return;
        }
        wx.showToast({ title: '扫码失败，请重试', icon: 'none' });
      },
    });
  },

  /** 识别成功后的统一处理：展示 + 记入历史 */
  accept: function (text) {
    var now = history.formatTime(Date.now());
    this.setData({
      result: text,
      hasResult: true,
      resultTime: now,
    });
    history.push('receive', text);
    getApp().globalData.lastContent = text;
    if (wx.vibrateShort) {
      try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 忽略 */ }
    }
    wx.showToast({ title: '识别成功', icon: 'success' });
  },

  onCopy: function () {
    var text = this.data.result;
    if (!text) { return; }
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
  },

  onSendMode: function () {
    var text = this.data.result;
    if (!text) { return; }
    getApp().globalData.lastContent = text;
    wx.switchTab({ url: '/pages/send/send' });
  },

  onClear: function () {
    this.setData({ result: '', hasResult: false, resultTime: '' });
  },
});
