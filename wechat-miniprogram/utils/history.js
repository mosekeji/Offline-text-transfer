/**
 * 历史记录：发送 / 接收的文字记录
 * 存储在本机（wx.setStorageSync），最多保留 200 条。
 */
var STORAGE_KEY = 'offline_qr_history';
var LIMIT = 200;

function read() {
  try {
    var list = wx.getStorageSync(STORAGE_KEY);
    if (!Array.isArray(list)) { return []; }
    return list.filter(function (r) {
      return r && typeof r.text === 'string' && r.text.length > 0;
    });
  } catch (e) {
    return [];
  }
}

function write(list) {
  try {
    wx.setStorageSync(STORAGE_KEY, list);
    return true;
  } catch (e) {
    // 容量不足时丢掉一半旧记录再试
    try {
      wx.setStorageSync(STORAGE_KEY, list.slice(0, Math.floor(list.length / 2)));
      wx.showToast({ title: '记录过多，已清理部分旧记录', icon: 'none' });
      return true;
    } catch (e2) {
      wx.showToast({ title: '保存失败：存储空间不足', icon: 'none' });
      return false;
    }
  }
}

/**
 * 新增一条记录。
 * 同一内容连续出现时不重复记录（只刷新时间），避免摄像头/扫码重复触发。
 */
function push(type, text) {
  if (!text || !String(text).trim()) { return false; }
  var content = String(text);
  var list = read();
  var top = list[0];
  if (top && top.text === content && top.type === type) {
    top.time = Date.now();
    write(list);
    return false;
  }
  list.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type: type === 'send' ? 'send' : 'receive',
    text: content,
    time: Date.now(),
  });
  if (list.length > LIMIT) { list = list.slice(0, LIMIT); }
  write(list);
  return true;
}

function remove(id) {
  var list = read().filter(function (r) { return r.id !== id; });
  write(list);
  return list;
}

function clear() {
  write([]);
}

/** 列表（新的在前）+ 界面用的时间标签 */
function listWithTime() {
  var list = read().slice().sort(function (a, b) { return b.time - a.time; });
  list.forEach(function (r) {
    r.timeText = formatTime(r.time);
    r.typeText = r.type === 'send' ? '发送' : '接收';
    r.len = r.text.length;
  });
  return list;
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function formatTime(ts) {
  var d = new Date(ts);
  var now = new Date();
  var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  var sameDay = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) { return '今天 ' + hm; }
  var yest = new Date(now.getTime() - 86400000);
  var sameYest = d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate();
  if (sameYest) { return '昨天 ' + hm; }
  if (d.getFullYear() === now.getFullYear()) {
    return pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + hm;
  }
  return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + hm;
}

function count() { return read().length; }

module.exports = {
  read: read,
  push: push,
  remove: remove,
  clear: clear,
  listWithTime: listWithTime,
  formatTime: formatTime,
  count: count,
  LIMIT: LIMIT,
};
