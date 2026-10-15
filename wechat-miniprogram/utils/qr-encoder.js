/**
 * 纯 JS 二维码编码器（无任何依赖，微信小程序 / Node 均可运行）
 *
 * 输出为一个布尔矩阵：true = 黑点，false = 白点。
 * 由小程序端 utils/qr.js 原样复制使用，本文件用于 Node 侧验证。
 */

/* ------------------------------ 常量表 ------------------------------ */
// 每个纠错等级下、每个版本的数据码字总数
const EC_CODEWORDS_PER_BLOCK = {
  L: [null, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [null, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [null, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [null, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

// 每个纠错等级下的分块数
const NUM_ERROR_CORRECTION_BLOCKS = {
  L: [null, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [null, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [null, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [null, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const EC_LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };
const EC_LEVELS = ['L', 'M', 'Q', 'H'];
const MODE_BYTE = 4;

function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) { result -= 36; }
  }
  return result;
}

function getNumDataCodewords(ver, ecl) {
  return Math.floor(getNumRawDataModules(ver) / 8) -
    EC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
}

/* --------------------------- GF(256) 运算 --------------------------- */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) { x ^= 0x11D; }
  }
  for (let i = 255; i < 512; i++) { GF_EXP[i] = GF_EXP[i - 255]; }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) { return 0; }
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data, degree) {
  const gen = rsGeneratorPoly(degree);
  const rem = new Array(degree).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor !== 0) {
      for (let j = 0; j < degree; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

/* ---------------------------- 位缓冲 ---------------------------- */
function appendBits(bb, val, len) {
  for (let i = len - 1; i >= 0; i--) { bb.push((val >>> i) & 1); }
}

function toUtf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xFFFF) { i++; }
    if (c < 0x80) { out.push(c); }
    else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
    else if (c < 0x10000) { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    else { out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
  }
  return out;
}

/* ---------------------------- 主编码 ---------------------------- */
function buildDataCodewords(bytes, ver, ecl) {
  const bb = [];
  appendBits(bb, MODE_BYTE, 4);
  appendBits(bb, bytes.length, ver <= 9 ? 8 : 16);
  for (let i = 0; i < bytes.length; i++) { appendBits(bb, bytes[i], 8); }

  const dataCapacityBits = getNumDataCodewords(ver, ecl) * 8;
  if (bb.length > dataCapacityBits) { throw new Error('数据过长'); }
  appendBits(bb, 0, Math.min(4, dataCapacityBits - bb.length));
  appendBits(bb, 0, (8 - (bb.length % 8)) % 8);
  for (let pad = 0xEC; bb.length < dataCapacityBits; pad ^= 0xEC ^ 0x11) {
    appendBits(bb, pad, 8);
  }

  const dataCodewords = new Uint8Array(bb.length / 8);
  for (let i = 0; i < bb.length; i++) {
    dataCodewords[i >>> 3] |= bb[i] << (7 - (i & 7));
  }
  return dataCodewords;
}

function interleave(dataCodewords, ver, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const blockEccLen = EC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = Array.from(dataCodewords.slice(k, k + datLen));
    k += datLen;
    const ecc = rsRemainder(dat, blockEccLen);
    if (i < numShortBlocks) { dat.push(0); } // 占位，交错时跳过
    blocks.push({ dat: dat, ecc: ecc });
  }

  const out = [];
  const maxDat = Math.max(...blocks.map(b => b.dat.length));
  for (let i = 0; i < maxDat; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i === shortBlockLen - blockEccLen && b < numShortBlocks) { continue; }
      if (i < blocks[b].dat.length) { out.push(blocks[b].dat[i]); }
    }
  }
  for (let i = 0; i < blockEccLen; i++) {
    for (let b = 0; b < blocks.length; b++) { out.push(blocks[b].ecc[i]); }
  }
  return Uint8Array.from(out);
}

/* ---------------------------- 矩阵绘制 ---------------------------- */
function makeMatrix(ver) {
  const size = ver * 4 + 17;
  const modules = [];
  const isFunction = [];
  for (let i = 0; i < size; i++) {
    modules.push(new Array(size).fill(false));
    isFunction.push(new Array(size).fill(false));
  }
  return { size: size, modules: modules, isFunction: isFunction };
}

function setFunctionModule(m, x, y, isDark) {
  m.modules[y][x] = isDark;
  m.isFunction[y][x] = true;
}

function drawFinderPattern(m, x, y) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < m.size && yy >= 0 && yy < m.size) {
        setFunctionModule(m, xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }
}

function drawAlignmentPattern(m, x, y) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFunctionModule(m, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function getAlignmentPatternPositions(ver) {
  if (ver === 1) { return []; }
  const numAlign = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = (ver === 32) ? 26 : Math.ceil((size - 13) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function drawFunctionPatterns(m, ver, ecl) {
  // timing
  for (let i = 0; i < m.size; i++) {
    setFunctionModule(m, 6, i, i % 2 === 0);
    setFunctionModule(m, i, 6, i % 2 === 0);
  }
  // finders + separators (drawn last wins, matching the spec layout)
  drawFinderPattern(m, 3, 3);
  drawFinderPattern(m, m.size - 4, 3);
  drawFinderPattern(m, 3, m.size - 4);
  // alignment
  const pos = getAlignmentPatternPositions(ver);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) { continue; }
      drawAlignmentPattern(m, pos[i], pos[j]);
    }
  }
  // reserve format info areas
  drawFormatBits(m, ecl, 0);
  // version info
  if (ver >= 7) { drawVersionBits(m, ver); }
}

function drawFormatBits(m, ecl, mask) {
  const data = (EC_LEVEL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) { rem = (rem << 1) ^ ((rem >>> 9) * 0x537); }
  const bits = ((data << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) { setFunctionModule(m, 8, i, ((bits >>> i) & 1) !== 0); }
  setFunctionModule(m, 8, 7, ((bits >>> 6) & 1) !== 0);
  setFunctionModule(m, 8, 8, ((bits >>> 7) & 1) !== 0);
  setFunctionModule(m, 7, 8, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) { setFunctionModule(m, 14 - i, 8, ((bits >>> i) & 1) !== 0); }

  for (let i = 0; i < 8; i++) { setFunctionModule(m, m.size - 1 - i, 8, ((bits >>> i) & 1) !== 0); }
  for (let i = 8; i < 15; i++) { setFunctionModule(m, 8, m.size - 15 + i, ((bits >>> i) & 1) !== 0); }
  setFunctionModule(m, 8, m.size - 8, true);
}

function drawVersionBits(m, ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) { rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25); }
  const bits = (ver << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) !== 0;
    const a = m.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(m, a, b, bit);
    setFunctionModule(m, b, a, bit);
  }
}

function drawCodewords(m, data) {
  let i = 0;
  for (let right = m.size - 1; right >= 1; right -= 2) {
    if (right === 6) { right = 5; }
    for (let vert = 0; vert < m.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? m.size - 1 - vert : vert;
        if (!m.isFunction[y][x] && i < data.length * 8) {
          m.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

function applyMask(m, mask) {
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.isFunction[y][x]) { continue; }
      let invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
        case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
        case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        default: invert = false;
      }
      if (invert) { m.modules[y][x] = !m.modules[y][x]; }
    }
  }
}

function getPenalty(m) {
  const size = m.size;
  const mod = m.modules;
  let penalty = 0;

  // 规则 1：连续同色
  for (let y = 0; y < size; y++) {
    let runColor = false, runX = 0;
    for (let x = 0; x < size; x++) {
      if (x === 0 || mod[y][x] !== runColor) { runColor = mod[y][x]; runX = 1; }
      else {
        runX++;
        if (runX === 5) { penalty += 3; }
        else if (runX > 5) { penalty++; }
      }
    }
  }
  for (let x = 0; x < size; x++) {
    let runColor = false, runY = 0;
    for (let y = 0; y < size; y++) {
      if (y === 0 || mod[y][x] !== runColor) { runColor = mod[y][x]; runY = 1; }
      else {
        runY++;
        if (runY === 5) { penalty += 3; }
        else if (runY > 5) { penalty++; }
      }
    }
  }

  // 规则 2：2x2 同色
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) { penalty += 3; }
    }
  }

  // 规则 3：类似定位图形的 1:1:3:1:1
  const pat = [true, false, true, true, true, false, true];
  const matches = (get) => {
    outer:
    for (let i = 0; i + 7 <= size; i++) {
      for (let j = 0; j < 7; j++) { if (get(i + j) !== pat[j]) { continue outer; } }
      const before = i >= 4 ? [get(i - 4), get(i - 3), get(i - 2), get(i - 1)] : null;
      const after = i + 11 <= size ? [get(i + 7), get(i + 8), get(i + 9), get(i + 10)] : null;
      const light4 = (arr) => arr && arr.every(v => v === false);
      if (light4(before) || light4(after)) { penalty += 40; }
    }
  };
  for (let y = 0; y < size; y++) { matches((k) => mod[y][k]); }
  for (let x = 0; x < size; x++) { matches((k) => mod[k][x]); }

  // 规则 4：黑白比例
  let dark = 0;
  for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) { if (mod[y][x]) { dark++; } } }
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  penalty += k * 10;
  return penalty;
}

/**
 * 生成二维码矩阵。
 * @param {string} text 要编码的文本（UTF-8，支持中文/emoji）
 * @param {string} ecl  纠错等级 L / M / Q / H，默认 M
 * @returns {boolean[][]} true = 黑点
 */
function encode(text, ecl) {
  if (typeof text !== 'string' || text.length === 0) { throw new Error('内容不能为空'); }
  ecl = EC_LEVELS.indexOf(ecl) >= 0 ? ecl : 'M';
  const bytes = toUtf8Bytes(text);

  let ver = 1;
  for (; ver <= 40; ver++) {
    const capacityBits = getNumDataCodewords(ver, ecl) * 8;
    const needBits = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
    if (needBits <= capacityBits) { break; }
  }
  if (ver > 40) { throw new Error('内容过长，无法生成二维码'); }

  const data = interleave(buildDataCodewords(bytes, ver, ecl), ver, ecl);

  const m = makeMatrix(ver);
  drawFunctionPatterns(m, ver, ecl);

  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    drawFormatBits(m, ecl, mask);
    applyMask(m, mask);
    const p = getPenalty(m);
    if (p < bestPenalty) { bestPenalty = p; bestMask = mask; }
    applyMask(m, mask); // 撤销
  }
  drawFormatBits(m, ecl, bestMask);
  drawCodewords(m, data);
  applyMask(m, bestMask);

  return m.modules;
}

module.exports = {
  encode: encode,
  toUtf8Bytes: toUtf8Bytes,
  getNumDataCodewords: getNumDataCodewords,
};
