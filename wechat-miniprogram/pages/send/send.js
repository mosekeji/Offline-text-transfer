/* ==================== 发送模式：生成二维码 ==================== */
var qr = require('../../utils/qr.js');
var history = require('../../utils/history.js');

var ECL_OPTIONS = [
  { value: 'L', label: 'L 低' },
  { value: 'M', label: 'M 中' },
  { value: 'Q', label: 'Q 较高' },
  { value: 'H', label: 'H 高' },
];

Page({
  data: {
    text: '',
    ecl: 'M',
    eclOptions: ECL_OPTIONS,
    hasQr: false,
    generating: false,
    canvasCss: 300,
    qrModules: 0,
  },

  canvasNode: null,

  onLoad: function () {
    var app = getApp();
    var saved = '';
    try { saved = wx.getStorageSync('offline_qr_ecl') || ''; } catch (e) { saved = ''; }
    var ecl = 'M';
    for (var i = 0; i < ECL_OPTIONS.length; i++) {
      if (ECL_OPTIONS[i].value === saved) { ecl = saved; }
    }
    this.setData({
      ecl: ecl,
      text: app.globalData.lastContent || '',
      canvasCss: this.computeCanvasSize(),
    });
  },

  onReady: function () {
    // 页面渲染完成后先把 canvas 节点缓存起来，避免首次生成时取不到
    this.ensureCanvasNode().catch(function () { /* 生成时会再试一次 */ });
  },

  onShow: function () {
    // 从“接收”页过来时，把识别到的内容带过来
    var app = getApp();
    if (app.globalData.lastContent && app.globalData.lastContent !== this.data.text) {
      this.setData({ text: app.globalData.lastContent });
    }
  },

  /** 画布可用宽度：屏幕宽度减去页面与卡片的内边距 */
  computeCanvasSize: function () {
    var info = this.getWindowInfo();
    var width = info.windowWidth || 375;
    var rpx2px = width / 750;
    // 页面左右各 24rpx + 卡片左右各 24rpx + 少量余量
    var size = width - (24 + 24 + 6) * 2 * rpx2px;
    return Math.max(200, Math.floor(size));
  },

  getWindowInfo: function () {
    try {
      if (typeof wx.getWindowInfo === 'function') { return wx.getWindowInfo(); }
    } catch (e) { /* 老版本基础库没有该接口 */ }
    return wx.getSystemInfoSync();
  },

  onInput: function (e) {
    this.setData({ text: e.detail.value });
  },

  onClearText: function () {
    this.setData({ text: '', hasQr: false, qrModules: 0 });
  },

  onPickEcl: function (e) {
    var value = e.currentTarget.dataset.value;
    if (value === this.data.ecl) { return; }
    this.setData({ ecl: value });
    try { wx.setStorageSync('offline_qr_ecl', value); } catch (err) { /* 忽略 */ }
    if (this.data.hasQr) { this.onGenerate(); }
  },

  onGenerate: function () {
    var that = this;
    var text = this.data.text;
    if (!text || !text.trim()) {
      wx.showToast({ title: '请先输入内容', icon: 'none' });
      return Promise.resolve();
    }
    this.setData({ generating: true });

    return this.ensureCanvasNode().then(function (node) {
      var info = that.getWindowInfo();
      var dpr = info.pixelRatio || 2;
      var available = that.computeCanvasSize();
      var result = qr.draw(node, text, available, that.data.ecl, dpr);
      that.setData({
        hasQr: true,
        generating: false,
        // 按整数模块算出的实际显示边长，保证 1:1 显示、不发虚
        canvasCss: result.displayCss,
        qrModules: result.modules,
      });
      history.push('send', text);
      getApp().globalData.lastContent = text;
      return result;
    }).catch(function (err) {
      that.setData({ generating: false });
      wx.showToast({
        title: (err && err.message) ? err.message : '生成失败，请重试',
        icon: 'none',
      });
    });
  },

  /**
   * 取 canvas 节点并缓存。
   * Canvas 2D 的节点在页面渲染完成后的前几帧可能查不到（返回 null），
   * 所以这里做多次重试，而不是查一次就报错。
   */
  ensureCanvasNode: function () {
    var that = this;
    if (this.canvasNode) { return Promise.resolve(this.canvasNode); }
    if (this.canvasPending) { return this.canvasPending; }

    this.canvasPending = new Promise(function (resolve, reject) {
      var MAX_TRIES = 8;
      var tries = 0;

      function queryOnce() {
        tries++;
        wx.createSelectorQuery()
          .in(that)
          .select('#qrcanvas')
          .fields({ node: true, size: true })
          .exec(function (res) {
            var node = res && res[0] && res[0].node;
            if (node) {
              that.canvasNode = node;
              that.canvasPending = null;
              resolve(node);
              return;
            }
            if (tries >= MAX_TRIES) {
              that.canvasPending = null;
              reject(new Error('画布初始化失败，请退出页面重新进入'));
              return;
            }
            // 前几次查得快一点，后面放慢
            setTimeout(queryOnce, tries < 3 ? 100 : 200);
          });
      }

      // 先等一次渲染，再开始查询
      if (typeof wx.nextTick === 'function') {
        wx.nextTick(function () { setTimeout(queryOnce, 30); });
      } else {
        setTimeout(queryOnce, 30);
      }
    });

    return this.canvasPending;
  },

  onSave: function () {
    var that = this;
    if (!this.data.hasQr || !this.canvasNode) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在保存…', mask: true });
    qr.toTempFile(this.canvasNode).then(function (filePath) {
      return new Promise(function (resolve, reject) {
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: resolve,
          fail: reject,
        });
      });
    }).then(function () {
      wx.hideLoading();
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    }).catch(function (err) {
      wx.hideLoading();
      var msg = (err && err.errMsg) || '';
      if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
        wx.showModal({
          title: '需要相册权限',
          content: '保存图片需要“保存到相册”权限，请在设置中开启。',
          confirmText: '去设置',
          success: function (r) { if (r.confirm) { wx.openSetting(); } },
        });
      } else if (msg.indexOf('cancel') < 0) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
    });
  },

  onUnload: function () {
    this.canvasNode = null;
  },
});
