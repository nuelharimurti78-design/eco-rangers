/**
 * ECO-RANGERS: QR CODE ENGINE & ANTI-CHEAT SYSTEM (2-STEP SCANNER)
 * Handles camera scanning via jsQR, waste photo snapshot proof,
 * anti-cheat diminishing returns, and QR generation.
 */

window.QREngine = (function () {
  let scanInterval = null;
  let isScanning = false;

  /**
   * Helper: Get current date formatted as YYYY-MM-DD in local time
   */
  function getTodayIsoDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * STEP 1: Take Waste Photo Snapshot from Video Feed
   * Captures current video frame, renders to snapshot canvas, and returns compressed thumbnail data URL.
   */
  function takeWasteSnapshot(videoEl, snapshotCanvasEl) {
    if (!videoEl || videoEl.readyState < videoEl.HAVE_CURRENT_DATA) {
      // Fallback empty snapshot canvas if video not ready
      snapshotCanvasEl.width = 160;
      snapshotCanvasEl.height = 120;
      const ctx = snapshotCanvasEl.getContext("2d");
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, 160, 120);
      ctx.fillStyle = "#39ff14";
      ctx.font = "10px monospace";
      ctx.fillText("📷 FOTO BUKTI SAMPAH", 15, 60);
      return snapshotCanvasEl.toDataURL("image/jpeg", 0.5);
    }

    const vw = videoEl.videoWidth || 320;
    const vh = videoEl.videoHeight || 240;

    // Render to snapshot canvas (scaled thumbnail)
    snapshotCanvasEl.width = 160;
    snapshotCanvasEl.height = 120;
    const ctx = snapshotCanvasEl.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, vw, vh, 0, 0, 160, 120);

    // Draw retro timestamp watermark overlay
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 100, 160, 20);
    ctx.fillStyle = "#ffee00";
    ctx.font = "8px monospace";
    ctx.fillText(`BUKTI: ${new Date().toLocaleTimeString('id-ID')}`, 5, 114);

    return snapshotCanvasEl.toDataURL("image/jpeg", 0.6);
  }

  /**
   * Anti-Cheat Diminishing Return Calculation & Log Proof Storage
   * Checks daily count, returns multiplier (1.0, 0.5, or 0.1), and saves photo log to state.
   */
  function processDailyScanAntiCheat(state, snapshotDataUrl, category) {
    const today = getTodayIsoDate();

    // Reset daily count if date has changed
    if (!state.dailyScans || state.dailyScans.date !== today) {
      state.dailyScans = {
        date: today,
        count: 0,
        logs: []
      };
    }

    if (!state.dailyScans.logs) {
      state.dailyScans.logs = [];
    }

    state.dailyScans.count += 1;
    const count = state.dailyScans.count;

    let multiplier = 1.0;
    let tierText = "100% EXP (Bonus Penuh!)";

    if (count >= 1 && count <= 3) {
      multiplier = 1.0;
      tierText = "100% EXP (Bonus Max - Scan 1-3)";
    } else if (count >= 4 && count <= 6) {
      multiplier = 0.5;
      tierText = "50% EXP (Diminishing Return - Scan 4-6)";
    } else {
      multiplier = 0.1;
      tierText = "10% EXP (Batas Harian Terlampaui - Scan 7+)";
    }

    // Save proof log (max 20 entries to protect localStorage quota)
    const logEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('id-ID'),
      date: today,
      count: count,
      category: category || "ORGANIC",
      tierText: tierText,
      photo: snapshotDataUrl || null
    };

    state.dailyScans.logs.unshift(logEntry);
    if (state.dailyScans.logs.length > 20) {
      state.dailyScans.logs.pop();
    }

    return {
      count: count,
      multiplier: multiplier,
      tierText: tierText,
      logEntry: logEntry
    };
  }

  /**
   * STEP 2: Start Scanner Loop
   * Reads video frame from webcam, renders to canvas, and runs jsQR detection.
   */
  function startScanner(videoEl, canvasEl, statusEl, onScanSuccess) {
    if (isScanning) return;
    isScanning = true;

    const ctx = canvasEl.getContext('2d');

    function tick() {
      if (!isScanning) return;

      if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
        canvasEl.height = videoEl.videoHeight || 300;
        canvasEl.width = videoEl.videoWidth || 300;

        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

        const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        
        if (window.jsQR) {
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            statusEl.textContent = `🎯 QR Terdeteksi: ${code.data}`;
            isScanning = false;

            // Trigger success callback
            onScanSuccess(code.data);
            return;
          }
        }
      }

      statusEl.textContent = "🔍 Mencari QR Code Tong Sampah...";
      scanInterval = requestAnimationFrame(tick);
    }

    tick();
  }

  /**
   * Stop Scanner
   */
  function stopScanner() {
    isScanning = false;
    if (scanInterval) {
      cancelAnimationFrame(scanInterval);
      scanInterval = null;
    }
  }

  /**
   * Parse QR Payload Data
   */
  function parseQrPayload(payload) {
    const raw = String(payload).trim().toUpperCase();
    
    if (raw.includes("ORGANIC") || raw.includes("ORGANIK")) {
      return { category: "ORGANIC", name: "Eco-Food Organik (Daun/Makanan)", itemKey: "food_organic" };
    } else if (raw.includes("PLASTIC") || raw.includes("ANORGANIK") || raw.includes("PLASTIK")) {
      return { category: "PLASTIC", name: "Eco-Food Plastik (Wrapper/Anorganik)", itemKey: "food_plastic" };
    } else if (raw.includes("BOTTLE") || raw.includes("BOTOL") || raw.includes("KALENG")) {
      return { category: "BOTTLE", name: "Eco-Food Botol (Wadah Minuman)", itemKey: "food_bottle" };
    }

    return { category: "ORGANIC", name: "Eco-Food Organik Umum", itemKey: "food_organic" };
  }

  /**
   * Admin Tool: Generate QR Code Canvas & PNG Download URL
   */
  function generateAdminQr(category, locationName, containerEl, downloadBtnEl) {
    containerEl.innerHTML = "";
    
    const qrText = `ECO_TRASH:${category}@${locationName || "SEKOLAH"}`;

    if (window.QRCode) {
      const qrcode = new QRCode(containerEl, {
        text: qrText,
        width: 160,
        height: 160,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });

      setTimeout(() => {
        const img = containerEl.querySelector("img");
        const canvas = containerEl.querySelector("canvas");
        const src = img ? img.src : (canvas ? canvas.toDataURL("image/png") : "");
        if (src) {
          downloadBtnEl.href = src;
          downloadBtnEl.download = `QR_${category}_${locationName || 'Tong'}.png`;
          downloadBtnEl.classList.remove("hidden");
        }
      }, 200);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 160, 160);
      ctx.fillStyle = "#000000";
      ctx.font = "12px monospace";
      ctx.fillText(category, 20, 80);
      containerEl.appendChild(canvas);

      downloadBtnEl.href = canvas.toDataURL("image/png");
      downloadBtnEl.classList.remove("hidden");
    }
  }

  return {
    getTodayIsoDate,
    takeWasteSnapshot,
    processDailyScanAntiCheat,
    startScanner,
    stopScanner,
    parseQrPayload,
    generateAdminQr
  };
})();
