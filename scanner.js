/**
 * Eco-Gotchi: WebAR Tamagotchi Daur Ulang
 * Fase 4: QR Code Scanner Controller & Anti-Cheat System
 */

const COOLDOWN_KEY = 'ECOGOTCHI_SCAN_COOLDOWN_V1';
const COOLDOWN_SECONDS = 30; // Batas waktu tunggu antar pemindaian (Anti-Cheat)

// Definisi Kategori Tempat Sampah & Imbalan Token
const ECO_BIN_TYPES = {
  PLASTIC: {
    id: 'PLASTIC',
    name: 'Daur Ulang Plastik',
    icon: '🥤',
    reward: 20,
    color: '#00e5ff',
    description: 'Botol, kemasan plastik, & wadah polimer'
  },
  PAPER: {
    id: 'PAPER',
    name: 'Daur Ulang Kertas & Kardus',
    icon: '📄',
    reward: 15,
    color: '#ffb300',
    description: 'Kardus boks, kertas arsip, & majalah'
  },
  METAL: {
    id: 'METAL',
    name: 'Daur Ulang Logam & Kaleng',
    icon: '🥫',
    reward: 25,
    color: '#ff4081',
    description: 'Kaleng minuman, aluminium, & besi bekas'
  },
  ORGANIC: {
    id: 'ORGANIC',
    name: 'Kompos Sampah Organik',
    icon: '🍎',
    reward: 10,
    color: '#76ff03',
    description: 'Sisa makanan, dedaunan, & kulit buah'
  },
  GLASS: {
    id: 'GLASS',
    name: 'Daur Ulang Kaca & Botol',
    icon: '🍾',
    reward: 30,
    color: '#69f0ae',
    description: 'Botol kaca, toples beling, & pecahan kaca'
  }
};

const ScannerManager = {
  videoElement: null,
  stream: null,
  isScanning: false,
  scanIntervalId: null,
  barcodeDetector: null,
  onScanSuccessCallback: null,

  /**
   * Inisialisasi Modul Scanner
   */
  init(videoElementId, onScanSuccess) {
    this.videoElement = document.getElementById(videoElementId);
    this.onScanSuccessCallback = onScanSuccess;

    // Deteksi apakah browser mendukung BarcodeDetector API bawaan
    if ('BarcodeDetector' in window) {
      try {
        this.barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        console.log('[ScannerManager] BarcodeDetector API didukung.');
      } catch (e) {
        console.warn('[ScannerManager] BarcodeDetector inisialisasi gagal:', e);
      }
    }
  },

  /**
   * Mulai Kamera Pemindai
   */
  async startScanner() {
    if (!this.videoElement) return false;
    this.stopScanner();

    try {
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.setAttribute('webkit-playsinline', 'true');
      this.videoElement.muted = true;
      await this.videoElement.play();

      this.isScanning = true;
      this.startContinuousDetection();
      console.log('[ScannerManager] Kamera scanner aktif.');
      return true;
    } catch (err) {
      console.error('[ScannerManager] Gagal membuka kamera scanner:', err);
      return false;
    }
  },

  /**
   * Hentikan Pemindai & Kamera
   */
  stopScanner() {
    this.isScanning = false;
    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    console.log('[ScannerManager] Scanner dihentikan.');
  },

  /**
   * Loop deteksi frame kamera secara berkala
   */
  startContinuousDetection() {
    if (!this.barcodeDetector) return;

    this.scanIntervalId = setInterval(async () => {
      if (!this.isScanning || !this.videoElement || this.videoElement.readyState < 2) return;

      try {
        const barcodes = await this.barcodeDetector.detect(this.videoElement);
        if (barcodes && barcodes.length > 0) {
          const rawValue = barcodes[0].rawValue;
          this.processQRCodePayload(rawValue);
        }
      } catch (err) {
        // Frame detect pass
      }
    }, 400);
  },

  /**
   * Periksa Status Sisa Waktu Cooldown (Anti-Cheat)
   * @returns {number} Sisa detik (0 jika cooldown selesai)
   */
  getCooldownRemaining() {
    try {
      const lastScan = localStorage.getItem(COOLDOWN_KEY);
      if (!lastScan) return 0;

      const elapsedSeconds = Math.floor((Date.now() - parseInt(lastScan, 10)) / 1000);
      const remaining = COOLDOWN_SECONDS - elapsedSeconds;
      return remaining > 0 ? remaining : 0;
    } catch (e) {
      return 0;
    }
  },

  /**
   * Catat Waktu Pemindaian Baru untuk Cooldown
   */
  setCooldown() {
    try {
      localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
    } catch (e) {
      console.error('[ScannerManager] Gagal menyimpan cooldown:', e);
    }
  },

  /**
   * Periksa & Validasi Batas Scan Harian (Maksimal 3x Per Hari)
   */
  checkDailyLimit() {
    const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    let lastScanDate = localStorage.getItem('lastScanDate');
    let scanCount = parseInt(localStorage.getItem('scanCount'), 10) || 0;

    // Reset hitungan jika tanggal berbeda
    if (lastScanDate !== today) {
      scanCount = 0;
      lastScanDate = today;
      localStorage.setItem('lastScanDate', lastScanDate);
      localStorage.setItem('scanCount', '0');
    }

    // Validasi kuota harian
    if (scanCount >= 3) {
      return { allowed: false, count: scanCount, message: 'Kuota scan hari ini sudah habis!' };
    }

    return { allowed: true, count: scanCount, date: today };
  },

  /**
   * Tambahkan hitungan scan harian setelah valid
   */
  incrementDailyLimit() {
    const status = this.checkDailyLimit();
    if (status.allowed) {
      const newCount = status.count + 1;
      localStorage.setItem('scanCount', newCount.toString());
      localStorage.setItem('lastScanDate', status.date);
      return newCount;
    }
    return status.count;
  },

  /**
   * Proses & Validasi Payload QR Code Tempat Sampah
   */
  processQRCodePayload(payload) {
    if (!payload || typeof payload !== 'string') return;

    console.log('[ScannerManager] Memproses Payload QR:', payload);
    const upper = payload.toUpperCase();

    // 1. Validasi Batas Scan Harian (Maksimal 3x)
    const dailyStatus = this.checkDailyLimit();
    if (!dailyStatus.allowed) {
      if (window.showToast) {
        window.showToast(`🚫 ${dailyStatus.message}`);
      }
      return { success: false, reason: 'daily_limit', message: dailyStatus.message };
    }

    // 2. Periksa Sistem Keamanan Cooldown (Anti-Cheat)
    const remainingCooldown = this.getCooldownRemaining();
    if (remainingCooldown > 0) {
      if (window.showToast) {
        window.showToast(`⏳ Cooldown! Tunggu ${remainingCooldown} detik lagi.`);
      }
      return { success: false, reason: 'cooldown', remaining: remainingCooldown };
    }

    // 3. Identifikasi Kategori Tempat Sampah & Metadata
    let detectedCategory = null;
    let metadata = { location: 'Tempat Sampah Daur Ulang', binId: '', instructions: '' };

    // Coba parsing jika format JSON dari Admin QR Generator
    try {
      if (payload.trim().startsWith('{') && payload.trim().endsWith('}')) {
        const parsed = JSON.parse(payload);
        if (parsed.app === 'ECO_GOTCHI' || parsed.type) {
          const catKey = (parsed.type || 'PLASTIC').toUpperCase();
          detectedCategory = ECO_BIN_TYPES[catKey] || ECO_BIN_TYPES.PLASTIC;
          metadata.location = parsed.location || metadata.location;
          metadata.binId = parsed.binId || '';
          metadata.instructions = parsed.instructions || '';
        }
      }
    } catch (e) {
      // Bukan JSON, lanjut ke string matching
    }

    if (!detectedCategory) {
      if (upper.includes('PLASTIC') || upper.includes('PLASTIK')) {
        detectedCategory = ECO_BIN_TYPES.PLASTIC;
      } else if (upper.includes('PAPER') || upper.includes('KERTAS') || upper.includes('KARDUS')) {
        detectedCategory = ECO_BIN_TYPES.PAPER;
      } else if (upper.includes('METAL') || upper.includes('LOGAM') || upper.includes('KALENG')) {
        detectedCategory = ECO_BIN_TYPES.METAL;
      } else if (upper.includes('ORGANIC') || upper.includes('ORGANIK') || upper.includes('KOMPOS')) {
        detectedCategory = ECO_BIN_TYPES.ORGANIC;
      } else if (upper.includes('GLASS') || upper.includes('KACA') || upper.includes('BOTOL')) {
        detectedCategory = ECO_BIN_TYPES.GLASS;
      } else if (upper.startsWith('ECO:') || upper.startsWith('ECO_BIN')) {
        detectedCategory = ECO_BIN_TYPES.PLASTIC;
      }
    }

    if (!detectedCategory) {
      if (window.showToast) {
        window.showToast('⚠️ QR Code tidak dikenali sebagai tempat sampah Eco-Gotchi.');
      }
      return { success: false, reason: 'invalid_format' };
    }

    // 4. Catat Cooldown Anti-Cheat & Tambah Counter Harian
    this.setCooldown();
    this.incrementDailyLimit();

    // 4. Tambah Token ke Dompet & Naikkan Counter Daur Ulang
    const descText = metadata.location && metadata.location !== 'Tempat Sampah Daur Ulang'
      ? `♻️ ${detectedCategory.name} (${metadata.location})`
      : `♻️ Scan ${detectedCategory.name}`;

    if (window.WalletManager) {
      window.WalletManager.addTokens(detectedCategory.reward, descText);
      window.WalletManager.incrementRecycleCount();
    }

    // 5. Panggil Callback Sukses (Tampilkan Popup Reward)
    if (typeof this.onScanSuccessCallback === 'function') {
      this.onScanSuccessCallback(detectedCategory, metadata);
    }

    return { success: true, category: detectedCategory, metadata };
  },

  /**
   * Fitur Simulator Pemindaian Sampel untuk Pengujian Cepat
   */
  simulateScan(categoryKey) {
    const category = ECO_BIN_TYPES[categoryKey] || ECO_BIN_TYPES.PLASTIC;
    const fakePayload = `ECO:${category.id}:${Math.floor(1000 + Math.random() * 9000)}`;
    return this.processQRCodePayload(fakePayload);
  }
};

window.ScannerManager = ScannerManager;
window.ECO_BIN_TYPES = ECO_BIN_TYPES;
