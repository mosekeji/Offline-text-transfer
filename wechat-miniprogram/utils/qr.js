/**
 * 二维码绘制：把 encode() 出来的矩阵画到 Canvas 2D 上。
 * 使用新版 Canvas 2D 接口（type="2d"），排版更精确，支持导出图片。
 */
var encoder = require('./qr-encoder.js');

/**
 * @param {object} canvasNode  Canvas 节点（wx.createSelectorQuery 获取的 node）
 * @param {string} text        要编码的文本
 * @param {number} availableCss 可用宽度（CSS px），二维码会尽量铺满它
 * @param {string} ecl         纠错等级 L/M/Q/H
 * @param {number} dpr         设备像素比
 * @returns {{displayCss:number, size:number, modules:number, cell:number}}
 */
function draw(canvasNode, text, availableCss, ecl, dpr) {
  if (!canvasNode) { throw new Error('找不到画布'); }
  dpr = dpr || 2;
  var matrix = encoder.encode(text, ecl || 'M');
  var count = matrix.length;

  // 静默区（白边）固定 4 个模块，保证可被其它 App 扫出
  var quiet = 4;
  var total = count + quiet * 2;

  // 物理像素对齐：每模块占整数个物理像素，画满画布，避免发虚
  var pxSize = Math.max(total, Math.floor(availableCss * dpr));
  var cellPx = Math.max(1, Math.floor(pxSize / total));
  var drawPx = cellPx * total;
  var displayCss = drawPx / dpr;

  canvasNode.width = drawPx;
  canvasNode.height = drawPx;

  var ctx = canvasNode.getContext('2d');
  if (ctx.setTransform) { ctx.setTransform(1, 0, 0, 1, 0, 0); }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, drawPx, drawPx);
  ctx.fillStyle = '#000000';
  for (var y = 0; y < count; y++) {
    for (var x = 0; x < count; x++) {
      if (!matrix[y][x]) { continue; }
      ctx.fillRect((x + quiet) * cellPx, (y + quiet) * cellPx, cellPx, cellPx);
    }
  }

  return { displayCss: displayCss, size: drawPx, modules: count, cell: cellPx, dpr: dpr };
}

/** 把画布导出为临时图片文件，返回 Promise<tempFilePath> */
function toTempFile(canvasNode) {
  return new Promise(function (resolve, reject) {
    wx.canvasToTempFilePath({
      canvas: canvasNode,
      fileType: 'png',
      success: function (res) { resolve(res.tempFilePath); },
      fail: function (err) { reject(err); },
    });
  });
}

module.exports = { draw: draw, toTempFile: toTempFile };
