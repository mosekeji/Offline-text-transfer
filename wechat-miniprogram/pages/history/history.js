/* ==================== 历史记录 ==================== */
var history = require('../../utils/history.js');

Page({
  data: {
    list: [],
    limit: history.LIMIT,
  },

  onShow: function () {
    this.refresh();
  },

  onPullDownRefresh: function () {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh: function () {
    this.setData({ list: history.listWithTime() });
  },

  find: function (id) {
    var list = this.data.list;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { return list[i]; }
    }
    return null;
  },

  onCopy: function (e) {
    var rec = this.find(e.currentTarget.dataset.id);
    if (!rec) { return; }
    wx.setClipboardData({
      data: rec.text,
      success: function () { wx.showToast({ title: '已复制', icon: 'success' }); },
    });
  },

  onDelete: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var rec = this.find(id);
    wx.showModal({
      title: '删除这条记录？',
      content: rec ? (rec.typeText + ' · ' + rec.timeText) : '',
      confirmText: '删除',
      confirmColor: '#E5484D',
      success: function (r) {
        if (!r.confirm) { return; }
        history.remove(id);
        that.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  onClearAll: function () {
    var that = this;
    if (!this.data.list.length) { return; }
    wx.showModal({
      title: '清空全部记录？',
      content: '将删除全部 ' + this.data.list.length + ' 条记录，此操作无法撤销。',
      confirmText: '清空',
      confirmColor: '#E5484D',
      success: function (r) {
        if (!r.confirm) { return; }
        history.clear();
        that.refresh();
        wx.showToast({ title: '已清空', icon: 'none' });
      },
    });
  },

  /** 内容较长时，点击后弹出完整内容 */
  onPreview: function (e) {
    var rec = this.find(e.currentTarget.dataset.id);
    if (!rec || rec.text.length <= 120) { return; }
    wx.showModal({
      title: rec.typeText + ' · ' + rec.timeText,
      content: rec.text,
      showCancel: true,
      cancelText: '关闭',
      confirmText: '复制',
      success: function (r) {
        if (r.confirm) {
          wx.setClipboardData({
            data: rec.text,
            success: function () { wx.showToast({ title: '已复制', icon: 'success' }); },
          });
        }
      },
    });
  },
});
