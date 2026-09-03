/**
 * Eco-Gotchi: WebAR Tamagotchi Daur Ulang
 * Admin Feature: Zero-Dependency QR Code Generator & Physical Sticker Maker
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRGenerator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // --- Lightweight Zero-Dependency QR Code Algorithm (Byte Mode) ---
  // Reed-Solomon Galois Field tables
  const GF256_EXP = new Uint8Array(512);
  const GF256_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF256_EXP[i] = x;
      GF256_EXP[i + 255] = x;
      GF256_LOG[x] = i;
      x <<= 1;
      if (x & 256) x ^= 0x11d;
    }
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
  }

  function rsGenPoly(n) {
    let poly = [1];
    for (let i = 0; i < n; i++) {
      const next = [];
      for (let j = 0; j < poly.length; j++) {
        next[j] = (next[j] || 0) ^ gfMul(poly[j], GF256_EXP[i]);
        next[j + 1] = (next[j + 1] || 0) ^ poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGenPoly(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const factor = res[i];
      if (factor !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], factor);
        }
      }
    }
    return res.slice(data.length);
  }

  // QR Spec Tables for Version 1 to 6 (Auto-sized up to 134 bytes)
  const QR_VERSIONS = [
    { ver: 1, size: 21, totalBytes: 26, dataBytes: 19, ecBytes: 7 },
    { ver: 2, size: 25, totalBytes: 44, dataBytes: 34, ecBytes: 10 },
    { ver: 3, size: 29, totalBytes: 70, dataBytes: 55, ecBytes: 15 },
    { ver: 4, size: 33, totalBytes: 100, dataBytes: 80, ecBytes: 20 },
    { ver: 5, size: 37, totalBytes: 134, dataBytes: 108, ecBytes: 26 },
    { ver: 6, size: 41, totalBytes: 172, dataBytes: 136, ecBytes: 36 }
  ];

  function encodeUTF8(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 128) {
        bytes.push(c);
      } else if (c < 2048) {
        bytes.push(192 | (c >> 6), 128 | (c & 63));
      } else {
        bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      }
    }
    return bytes;
  }

  function createQRMatrix(text) {
    const rawBytes = encodeUTF8(text);
    let targetVer = QR_VERSIONS[0];
    for (let v of QR_VERSIONS) {
      if (rawBytes.length + 3 <= v.dataBytes) {
        targetVer = v;
        break;
      }
    }

    const bitBuffer = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bitBuffer.push((val >> i) & 1);
      }
    }

    // 1. Mode Indicator (Byte Mode: 0100)
    pushBits(4, 4);
    // 2. Character Count Indicator (8 bits for Version 1-9)
    pushBits(rawBytes.length, 8);
    // 3. Data payload
    for (let b of rawBytes) {
      pushBits(b, 8);
    }
    // 4. Terminator (up to 4 zeroes)
    const maxBits = targetVer.dataBytes * 8;
    for (let i = 0; i < 4 && bitBuffer.length < maxBits; i++) {
      bitBuffer.push(0);
    }
    while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

    // 5. Pad Bytes
    const padBytes = [0xEC, 0x11];
    let padIdx = 0;
    while (bitBuffer.length < maxBits) {
      pushBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    // 6. Convert bits to byte array
    const dataArray = new Uint8Array(targetVer.dataBytes);
    for (let i = 0; i < targetVer.dataBytes; i++) {
      let b = 0;
      for (let bit = 0; bit < 8; bit++) {
        b = (b << 1) | bitBuffer[i * 8 + bit];
      }
      dataArray[i] = b;
    }

    // 7. Generate Error Correction Bytes
    const ecArray = rsEncode(dataArray, targetVer.ecBytes);
    const finalCodewords = new Uint8Array(targetVer.totalBytes);
    finalCodewords.set(dataArray);
    finalCodewords.set(ecArray, dataArray.length);

    // 8. Build Matrix Grid
    const size = targetVer.size;
    const matrix = Array.from({ length: size }, () => Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));

    function setFinder(r, c) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const row = r + dr;
          const col = c + dc;
          if (row >= 0 && row < size && col >= 0 && col < size) {
            reserved[row][col] = true;
            if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
              const isBlack = (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
              matrix[row][col] = isBlack ? 1 : 0;
            } else {
              matrix[row][col] = 0;
            }
          }
        }
      }
    }

    // Position Finder Patterns
    setFinder(0, 0);
    setFinder(0, size - 7);
    setFinder(size - 7, 0);

    // Timing Patterns
    for (let i = 8; i < size - 8; i++) {
      if (!reserved[6][i]) {
        matrix[6][i] = (i % 2 === 0) ? 1 : 0;
        reserved[6][i] = true;
      }
      if (!reserved[i][6]) {
        matrix[i][6] = (i % 2 === 0) ? 1 : 0;
        reserved[i][6] = true;
      }
    }

    // Dark Module
    matrix[4 * targetVer.ver + 9][8] = 1;
    reserved[4 * targetVer.ver + 9][8] = true;

    // Reserve Format Info Area
    for (let i = 0; i < 9; i++) {
      if (!reserved[8][i]) { reserved[8][i] = true; matrix[8][i] = 0; }
      if (!reserved[i][8]) { reserved[i][8] = true; matrix[i][8] = 0; }
    }
    for (let i = 0; i < 8; i++) {
      if (!reserved[8][size - 1 - i]) { reserved[8][size - 1 - i] = true; matrix[8][size - 1 - i] = 0; }
      if (!reserved[size - 1 - i][8]) { reserved[size - 1 - i][8] = true; matrix[size - 1 - i][8] = 0; }
    }

    // 9. Place Data Bits with standard Mask Pattern (Pattern 0: (row + col) % 2 === 0)
    let bitIdx = 0;
    const totalDataBits = finalCodewords.length * 8;
    let right = size - 1;
    let upward = true;

    while (right > 0) {
      if (right === 6) right--; // Skip vertical timing column
      for (let step = 0; step < size; step++) {
        const row = upward ? (size - 1 - step) : step;
        for (let col = right; col >= right - 1; col--) {
          if (!reserved[row][col]) {
            let bit = 0;
            if (bitIdx < totalDataBits) {
              const byteI = Math.floor(bitIdx / 8);
              const bitI = 7 - (bitIdx % 8);
              bit = (finalCodewords[byteI] >> bitI) & 1;
              bitIdx++;
            }
            // Mask 0: Invert bit if (row + col) % 2 == 0
            const mask = ((row + col) % 2 === 0) ? 1 : 0;
            matrix[row][col] = bit ^ mask;
          }
        }
      }
      upward = !upward;
      right -= 2;
    }

    // 10. Format Information (Mask 0, Error Level L: 01) -> Format bits: 111011111000100
    const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
    const fmtCoords = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    for (let i = 0; i < 15; i++) {
      const [r, c] = fmtCoords[i];
      matrix[r][c] = formatBits[i];
    }
    for (let i = 0; i < 8; i++) {
      matrix[size - 1 - i][8] = formatBits[i];
    }
    for (let i = 0; i < 7; i++) {
      matrix[8][size - 7 + i] = formatBits[8 + i];
    }

    return matrix;
  }

  // --- Public Methods ---
  return {
    /**
     * Render matrix QR murni ke canvas
     */
    drawQR(text, canvas, moduleSize = 8, margin = 4) {
      const matrix = createQRMatrix(text);
      const size = matrix.length;
      const totalPixels = (size + margin * 2) * moduleSize;

      canvas.width = totalPixels;
      canvas.height = totalPixels;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalPixels, totalPixels);

      ctx.fillStyle = '#0a1914';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (matrix[r][c] === 1) {
            ctx.fillRect(
              (c + margin) * moduleSize,
              (r + margin) * moduleSize,
              moduleSize,
              moduleSize
            );
          }
        }
      }
      return canvas;
    },

    /**
     * Render Stiker Fisik Lengkap Siap Cetak
     * @param {Object} data { binId, name, location, type, reward, instructions }
     * @param {HTMLCanvasElement} canvas
     */
    generateStickerCanvas(data, canvas) {
      const qrPayload = JSON.stringify({
        app: 'ECO_GOTCHI',
        type: data.type || 'PLASTIC',
        binId: data.binId || 'BIN-001',
        name: data.name || 'Tempat Sampah Daur Ulang',
        location: data.location || 'Area Umum',
        reward: data.reward || 20,
        instructions: data.instructions || 'Masukkan sampah sesuai kategori'
      });

      const width = 460;
      const height = 580;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // 1. Background Kartu Stiker Retro
      ctx.fillStyle = '#0a1914';
      ctx.fillRect(0, 0, width, height);

      // 2. Border Neon Luar & Dalam
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, width - 24, height - 24);

      ctx.strokeStyle = 'rgba(0, 255, 157, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(18, 18, width - 36, height - 36);

      // 3. Header Logo & Judul
      ctx.fillStyle = '#00ff9d';
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ ECO-GOTCHI RECYCLE POINT ⚡', width / 2, 48);

      // Garis Pemisah
      ctx.strokeStyle = 'rgba(0, 255, 157, 0.3)';
      ctx.beginPath();
      ctx.moveTo(30, 60);
      ctx.lineTo(width - 30, 60);
      ctx.stroke();

      // 4. Kategori Sampah & Reward Badge
      const catColor = data.color || '#00e5ff';
      const catIcon = data.icon || '🥤';
      const catName = (data.name || 'DAUR ULANG SAMPAH').toUpperCase();

      ctx.fillStyle = catColor;
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillText(`${catIcon} ${catName}`, width / 2, 88);

      // Reward Pill Tag
      ctx.fillStyle = '#ffb300';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillText(`+${data.reward || 20} ECO-TOKEN PER SCAN`, width / 2, 110);

      // 5. Render QR Code di Tengah
      const qrCanvas = document.createElement('canvas');
      this.drawQR(qrPayload, qrCanvas, 6, 2);

      const qrSize = 210;
      const qrX = (width - qrSize) / 2;
      const qrY = 130;

      // Frame Putih untuk QR
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);

      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      // 6. Metadata Tempat Sampah
      const infoY = qrY + qrSize + 28;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Courier New", monospace';
      ctx.fillText(`📍 LOKASI: ${data.location || 'Semua Area'}`, width / 2, infoY);

      ctx.fillStyle = '#81c784';
      ctx.font = '11px "Courier New", monospace';
      ctx.fillText(`ID TONG: ${data.binId || 'BIN-001'}`, width / 2, infoY + 22);

      // 7. Petunjuk Pembuangan
      ctx.fillStyle = '#e0e0e0';
      ctx.font = 'italic 11px sans-serif';
      const instText = `💡 "${data.instructions || 'Buang sampah pada tempatnya'}"`;
      ctx.fillText(instText, width / 2, infoY + 44);

      // 8. Footer Call-to-Action
      ctx.fillStyle = '#00ff9d';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText('Pindai via Aplikasi Eco-Gotchi WebAR', width / 2, height - 32);

      return canvas;
    },

    /**
     * Unduh Canvas sebagai File Gambar PNG
     */
    downloadSticker(canvas, filename = 'stiker-tong-sampah.png') {
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    },

    /**
     * Cetak Stiker Langsung ke Printer
     */
    printSticker(canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`
          <html>
            <head>
              <title>Cetak Stiker Tempat Sampah Eco-Gotchi</title>
              <style>
                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
                img { max-width: 90%; height: auto; border: 1px solid #ccc; }
                @media print {
                  body { background: transparent; }
                  img { max-width: 100%; border: none; }
                }
              </style>
            </head>
            <body>
              <img src="${dataUrl}" onload="window.print(); window.close();" />
            </body>
          </html>
        `);
        win.document.close();
      }
    }
  };
}));
