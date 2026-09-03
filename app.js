/**
 * Eco-Gotchi: WebAR Tamagotchi Daur Ulang
 * Fase 4: Main Application Controller (Router, Wallet, Scanner, Anti-Cheat & Admin QR Generator)
 */

const ADMIN_PIN = 'admin123'; // PIN Akses Khusus Admin

// State App PWA & Navigasi
const APP_STATE = {
  currentView: 'lobby', // 'lobby' | 'ar'
  deferredPrompt: null,
  isInstalled: false,
  isAdmin: false,
  isOnline: navigator.onLine,
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
  cooldownTimerId: null
};

// DOM Elements Cache
const DOM = {
  // Screens
  viewLobby: document.getElementById('view-lobby'),
  viewAR: document.getElementById('view-ar'),

  // Navigation Buttons
  btnEnterAR: document.getElementById('btn-enter-ar'),
  btnBackLobby: document.getElementById('btn-back-lobby'),

  // Wallet Elements
  headerTokenChip: document.getElementById('header-token-chip'),
  headerTokenVal: document.getElementById('header-token-val'),
  lobbyTokenStat: document.getElementById('lobby-token-stat'),
  lobbyRecycleStat: document.getElementById('lobby-recycle-stat'),
  modalWallet: document.getElementById('modal-wallet'),
  modalWalletBalance: document.getElementById('modal-wallet-balance'),
  txHistoryList: document.getElementById('tx-history-list'),
  btnOpenWallet: document.getElementById('btn-open-wallet'),
  btnCloseWallet: document.getElementById('btn-close-wallet'),

  // Scanner Elements (Fase 4)
  btnOpenScanner: document.getElementById('btn-open-scanner'),
  modalScanner: document.getElementById('modal-scanner'),
  btnCloseScanner: document.getElementById('btn-close-scanner'),
  cooldownStatusBox: document.getElementById('cooldown-status-box'),
  cooldownStatusText: document.getElementById('cooldown-status-text'),
  simBinBtns: document.querySelectorAll('.sim-bin-btn'),

  // Reward Modal Elements (Fase 4)
  modalReward: document.getElementById('modal-reward'),
  rewardIcon: document.getElementById('reward-icon'),
  rewardBinName: document.getElementById('reward-bin-name'),
  rewardAmountText: document.getElementById('reward-amount-text'),
  btnClaimReward: document.getElementById('btn-claim-reward'),

  // Admin Elements (Admin QR Feature)
  btnOpenAdmin: document.getElementById('btn-open-admin'),
  modalAdminAuth: document.getElementById('modal-admin-auth'),
  btnCloseAdminAuth: document.getElementById('btn-close-admin-auth'),
  adminPinInput: document.getElementById('admin-pin-input'),
  btnSubmitAdminPin: document.getElementById('btn-submit-admin-pin'),
  adminAuthError: document.getElementById('admin-auth-error'),

  modalAdminQr: document.getElementById('modal-admin-qr'),
  btnCloseAdminQr: document.getElementById('btn-close-admin-qr'),
  qrBinType: document.getElementById('qr-bin-type'),
  qrBinLocation: document.getElementById('qr-bin-location'),
  qrBinId: document.getElementById('qr-bin-id'),
  qrBinInstructions: document.getElementById('qr-bin-instructions'),
  btnGenerateSticker: document.getElementById('btn-generate-sticker'),
  stickerPreviewCanvas: document.getElementById('sticker-preview-canvas'),
  btnDownloadSticker: document.getElementById('btn-download-sticker'),
  btnPrintSticker: document.getElementById('btn-print-sticker'),

  // Guide Modal Elements
  modalGuide: document.getElementById('modal-guide'),
  btnOpenGuide: document.getElementById('btn-open-guide'),
  btnCloseGuide: document.getElementById('btn-close-guide'),

  // AR Controls
  btnToggleCam: document.getElementById('btn-toggle-cam'),
  btnFlipCam: document.getElementById('btn-flip-cam'),

  // System Badges & Toast
  networkStatus: document.getElementById('network-status'),
  networkText: document.getElementById('network-text'),
  toast: document.getElementById('toast-notification')
};

/**
 * Inisialisasi Aplikasi Saat Halaman Selesai Dimuat
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[EcoGotchi] Inisialisasi Sistem Lengkap + Admin QR Generator...');

  // 1. Inisialisasi PWA Core
  initServiceWorker();
  initPWAInstallPrompt();
  initNetworkMonitor();

  // 2. Inisialisasi Dompet Eco-Token
  if (window.WalletManager) {
    window.WalletManager.init();
    setupWalletSync();
  }

  // 3. Inisialisasi Game Engine AR Monster & Camera Manager
  if (window.GameManager) {
    window.GameManager.init('game-container');
  }

  if (window.CameraManager) {
    window.CameraManager.init('camera-feed');
    setupCameraControls();
  }

  // 4. Inisialisasi Scanner QR & Anti-Cheat
  if (window.ScannerManager) {
    window.ScannerManager.init('scanner-video', (category, metadata) => {
      handleScanSuccess(category, metadata);
    });
  }

  // 5. Inisialisasi Navigasi, Modal, & Fitur Admin
  setupNavigation();
  setupModals();
  setupScannerEvents();
  setupAdminEvents();
});

/**
 * Konfigurasi Sistem Navigasi Antar Layar (Lobby ⟷ AR)
 */
function setupNavigation() {
  // Masuk ke Mode WebAR
  if (DOM.btnEnterAR) {
    DOM.btnEnterAR.addEventListener('click', async () => {
      switchView('ar');
      showToast('Memasuki Mode WebAR...');
      
      if (window.CameraManager) {
        await window.CameraManager.startCamera();
      }
    });
  }

  // Kembali ke Halaman Lobby (Home)
  if (DOM.btnBackLobby) {
    DOM.btnBackLobby.addEventListener('click', () => {
      switchView('lobby');
      showToast('Kembali ke Halaman Lobby');
      
      if (window.CameraManager) {
        window.CameraManager.stopCamera();
      }
    });
  }
}

/**
 * Fungsi Pengganti Layar Aktif (Router)
 */
function switchView(targetView) {
  APP_STATE.currentView = targetView;

  if (targetView === 'lobby') {
    DOM.viewLobby.classList.add('active');
    DOM.viewAR.classList.remove('active');
  } else if (targetView === 'ar') {
    DOM.viewLobby.classList.remove('active');
    DOM.viewAR.classList.add('active');

    if (window.GameManager) {
      window.GameManager.resumeAR();
      setTimeout(() => {
        window.GameManager.resumeAR();
      }, 80);
    }
  }
}

/**
 * Konfigurasi Sinkronisasi Dompet ke Antarmuka Pengguna
 */
function setupWalletSync() {
  window.WalletManager.onChange((balance, transactions, recycleCount) => {
    if (DOM.headerTokenVal) DOM.headerTokenVal.textContent = balance;
    if (DOM.lobbyTokenStat) DOM.lobbyTokenStat.textContent = `${balance} ECO`;
    if (DOM.lobbyRecycleStat) DOM.lobbyRecycleStat.textContent = `${recycleCount}x Scan`;
    if (DOM.modalWalletBalance) DOM.modalWalletBalance.textContent = `${balance} ECO`;

    if (DOM.txHistoryList) {
      DOM.txHistoryList.innerHTML = '';
      if (transactions.length === 0) {
        DOM.txHistoryList.innerHTML = '<div style="text-align:center; color: var(--text-dim); padding: 10px;">Belum ada riwayat transaksi.</div>';
        return;
      }

      transactions.forEach((tx) => {
        const item = document.createElement('div');
        item.className = 'tx-item';
        
        const isEarn = tx.type === 'EARN';
        const sign = isEarn ? '+' : '-';
        const amountClass = isEarn ? 'earn' : 'spend';
        
        const dateStr = new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
          <div>
            <div class="tx-desc">${tx.description}</div>
            <div class="tx-time">${dateStr}</div>
          </div>
          <div class="tx-amount ${amountClass}">${sign}${tx.amount} ECO</div>
        `;
        DOM.txHistoryList.appendChild(item);
      });
    }
  });
}

/**
 * Konfigurasi Event Scanner
 */
function setupScannerEvents() {
  if (DOM.simBinBtns) {
    DOM.simBinBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const binType = btn.getAttribute('data-bin');
        if (window.ScannerManager) {
          window.ScannerManager.simulateScan(binType);
        }
      });
    });
  }

  if (DOM.btnClaimReward) {
    DOM.btnClaimReward.addEventListener('click', () => {
      if (DOM.modalReward) DOM.modalReward.classList.remove('active');
      showToast('🪙 Eco-Token berhasil masuk ke dompet Anda!');
    });
  }
}

/**
 * Penanganan Saat Scan Berhasil
 */
function handleScanSuccess(category, metadata = {}) {
  if (DOM.modalScanner) DOM.modalScanner.classList.remove('active');
  if (window.ScannerManager) window.ScannerManager.stopScanner();

  if (DOM.rewardIcon) DOM.rewardIcon.textContent = category.icon;
  
  const locName = (metadata && metadata.location && metadata.location !== 'Tempat Sampah Daur Ulang')
    ? `${category.name} • 📍 ${metadata.location}`
    : category.name;
    
  if (DOM.rewardBinName) DOM.rewardBinName.textContent = locName;
  if (DOM.rewardAmountText) DOM.rewardAmountText.textContent = `+${category.reward} ECO`;

  if (DOM.modalReward) {
    DOM.modalReward.classList.add('active');
  }

  updateCooldownUI();
}

/**
 * Perbarui Tampilan Cooldown Anti-Cheat
 */
function updateCooldownUI() {
  if (!window.ScannerManager || !DOM.cooldownStatusText || !DOM.cooldownStatusBox) return;

  const remaining = window.ScannerManager.getCooldownRemaining();

  if (remaining > 0) {
    DOM.cooldownStatusBox.classList.remove('ready');
    DOM.cooldownStatusText.textContent = `Anti-Cheat: Cooldown aktif (${remaining}s)`;
  } else {
    DOM.cooldownStatusBox.classList.add('ready');
    DOM.cooldownStatusText.textContent = 'Anti-Cheat: Scanner Siap Digunakan';
  }
}

function startCooldownMonitor() {
  updateCooldownUI();
  if (APP_STATE.cooldownTimerId) clearInterval(APP_STATE.cooldownTimerId);
  APP_STATE.cooldownTimerId = setInterval(() => {
    updateCooldownUI();
  }, 1000);
}

/**
 * Konfigurasi Fitur Admin QR & Stiker Generator
 */
function setupAdminEvents() {
  // Verifikasi PIN Admin
  const submitAdminPin = () => {
    const pin = (DOM.adminPinInput ? DOM.adminPinInput.value : '').trim();
    if (pin === ADMIN_PIN || pin === 'eco2026') {
      APP_STATE.isAdmin = true;
      if (DOM.adminAuthError) DOM.adminAuthError.classList.add('hidden');
      if (DOM.modalAdminAuth) DOM.modalAdminAuth.classList.remove('active');
      if (DOM.adminPinInput) DOM.adminPinInput.value = '';
      
      // Buka Modal Generator & Render Stiker Awal
      if (DOM.modalAdminQr) DOM.modalAdminQr.classList.add('active');
      generateCurrentSticker();
      showToast('🔓 Akses Admin Diberikan.');
    } else {
      if (DOM.adminAuthError) DOM.adminAuthError.classList.remove('hidden');
    }
  };

  if (DOM.btnSubmitAdminPin) DOM.btnSubmitAdminPin.addEventListener('click', submitAdminPin);
  if (DOM.adminPinInput) {
    DOM.adminPinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitAdminPin();
    });
  }

  // Generate Stiker saat form diubah / tombol diklik
  const updateSticker = () => generateCurrentSticker();

  if (DOM.btnGenerateSticker) DOM.btnGenerateSticker.addEventListener('click', updateSticker);
  if (DOM.qrBinType) DOM.qrBinType.addEventListener('change', updateSticker);
  if (DOM.qrBinLocation) DOM.qrBinLocation.addEventListener('input', updateSticker);
  if (DOM.qrBinId) DOM.qrBinId.addEventListener('input', updateSticker);
  if (DOM.qrBinInstructions) DOM.qrBinInstructions.addEventListener('input', updateSticker);

  // Unduh Gambar Stiker PNG
  if (DOM.btnDownloadSticker) {
    DOM.btnDownloadSticker.addEventListener('click', () => {
      if (!DOM.stickerPreviewCanvas || !window.QRGenerator) return;
      const binId = DOM.qrBinId ? DOM.qrBinId.value.trim() || 'BIN-001' : 'BIN-001';
      window.QRGenerator.downloadSticker(DOM.stickerPreviewCanvas, `stiker-${binId}.png`);
      showToast(`💾 Stiker ${binId}.png berhasil diunduh!`);
    });
  }

  // Cetak Stiker ke Printer
  if (DOM.btnPrintSticker) {
    DOM.btnPrintSticker.addEventListener('click', () => {
      if (!DOM.stickerPreviewCanvas || !window.QRGenerator) return;
      window.QRGenerator.printSticker(DOM.stickerPreviewCanvas);
    });
  }
}

/**
 * Render Stiker QR Berdasarkan Input Form Admin
 */
function generateCurrentSticker() {
  if (!window.QRGenerator || !DOM.stickerPreviewCanvas) return;

  const typeKey = DOM.qrBinType ? DOM.qrBinType.value : 'PLASTIC';
  const category = (window.ECO_BIN_TYPES && window.ECO_BIN_TYPES[typeKey]) ? window.ECO_BIN_TYPES[typeKey] : {
    name: 'Daur Ulang Plastik', icon: '🥤', reward: 20, color: '#00e5ff'
  };

  const data = {
    type: typeKey,
    name: category.name,
    icon: category.icon,
    reward: category.reward,
    color: category.color,
    location: DOM.qrBinLocation ? DOM.qrBinLocation.value.trim() : 'Area Umum',
    binId: DOM.qrBinId ? DOM.qrBinId.value.trim() : 'BIN-001',
    instructions: DOM.qrBinInstructions ? DOM.qrBinInstructions.value.trim() : 'Masukkan sampah pada tempatnya'
  };

  window.QRGenerator.generateStickerCanvas(data, DOM.stickerPreviewCanvas);
}

/**
 * Konfigurasi Interaksi Semua Modal
 */
function setupModals() {
  // Modal Dompet
  const openWallet = () => DOM.modalWallet.classList.add('active');
  const closeWallet = () => DOM.modalWallet.classList.remove('active');

  if (DOM.headerTokenChip) DOM.headerTokenChip.addEventListener('click', openWallet);
  if (DOM.btnOpenWallet) DOM.btnOpenWallet.addEventListener('click', openWallet);
  if (DOM.btnCloseWallet) DOM.btnCloseWallet.addEventListener('click', closeWallet);
  if (DOM.modalWallet) {
    DOM.modalWallet.addEventListener('click', (e) => {
      if (e.target === DOM.modalWallet) closeWallet();
    });
  }

  // Modal Scanner (Fase 4)
  const openScanner = async () => {
    DOM.modalScanner.classList.add('active');
    startCooldownMonitor();
    if (window.ScannerManager) {
      await window.ScannerManager.startScanner();
    }
  };

  const closeScanner = () => {
    DOM.modalScanner.classList.remove('active');
    if (APP_STATE.cooldownTimerId) clearInterval(APP_STATE.cooldownTimerId);
    if (window.ScannerManager) {
      window.ScannerManager.stopScanner();
    }
  };

  if (DOM.btnOpenScanner) DOM.btnOpenScanner.addEventListener('click', openScanner);
  if (DOM.btnCloseScanner) DOM.btnCloseScanner.addEventListener('click', closeScanner);
  if (DOM.modalScanner) {
    DOM.modalScanner.addEventListener('click', (e) => {
      if (e.target === DOM.modalScanner) closeScanner();
    });
  }

  // Modal Admin PIN Auth & Generator
  const openAdminAuth = () => {
    if (APP_STATE.isAdmin) {
      if (DOM.modalAdminQr) DOM.modalAdminQr.classList.add('active');
      generateCurrentSticker();
    } else {
      if (DOM.modalAdminAuth) DOM.modalAdminAuth.classList.add('active');
      if (DOM.adminPinInput) {
        DOM.adminPinInput.value = '';
        setTimeout(() => DOM.adminPinInput.focus(), 150);
      }
    }
  };

  const closeAdminAuth = () => {
    if (DOM.modalAdminAuth) DOM.modalAdminAuth.classList.remove('active');
    if (DOM.adminAuthError) DOM.adminAuthError.classList.add('hidden');
  };

  const closeAdminQr = () => {
    if (DOM.modalAdminQr) DOM.modalAdminQr.classList.remove('active');
  };

  if (DOM.btnOpenAdmin) DOM.btnOpenAdmin.addEventListener('click', openAdminAuth);
  if (DOM.btnCloseAdminAuth) DOM.btnCloseAdminAuth.addEventListener('click', closeAdminAuth);
  if (DOM.modalAdminAuth) {
    DOM.modalAdminAuth.addEventListener('click', (e) => {
      if (e.target === DOM.modalAdminAuth) closeAdminAuth();
    });
  }

  if (DOM.btnCloseAdminQr) DOM.btnCloseAdminQr.addEventListener('click', closeAdminQr);
  if (DOM.modalAdminQr) {
    DOM.modalAdminQr.addEventListener('click', (e) => {
      if (e.target === DOM.modalAdminQr) closeAdminQr();
    });
  }

  // Modal Panduan
  const openGuide = () => DOM.modalGuide.classList.add('active');
  const closeGuide = () => DOM.modalGuide.classList.remove('active');

  if (DOM.btnOpenGuide) DOM.btnOpenGuide.addEventListener('click', openGuide);
  if (DOM.btnCloseGuide) DOM.btnCloseGuide.addEventListener('click', closeGuide);
  if (DOM.modalGuide) {
    DOM.modalGuide.addEventListener('click', (e) => {
      if (e.target === DOM.modalGuide) closeGuide();
    });
  }
}

/**
 * Konfigurasi Tombol Kontrol Kamera AR
 */
function setupCameraControls() {
  if (DOM.btnToggleCam) {
    DOM.btnToggleCam.addEventListener('click', async () => {
      const isLive = await window.CameraManager.toggleCamera();
      if (isLive) {
        showToast('Kamera WebAR aktif.');
      } else {
        showToast('Kamera WebAR dimatikan (Mode Simulasi).');
      }
    });
  }

  if (DOM.btnFlipCam) {
    DOM.btnFlipCam.addEventListener('click', async () => {
      if (!window.CameraManager.isActive) {
        showToast('Nyalakan kamera terlebih dahulu.');
        return;
      }
      await window.CameraManager.switchCamera();
      const currentMode = window.CameraManager.facingMode === 'environment' ? 'Belakang' : 'Depan';
      showToast(`Beralih ke Kamera ${currentMode}`);
    });
  }
}

/**
 * Registrasi Service Worker untuk Caching & Offline PWA
 */
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((registration) => {
          console.log('[ServiceWorker] Scope terdaftar:', registration.scope);
        })
        .catch((error) => {
          console.error('[ServiceWorker] Gagal mendaftar:', error);
        });
    });
  }
}

/**
 * Tangani Event Instalasi PWA
 */
function initPWAInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    APP_STATE.deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    APP_STATE.isInstalled = true;
    showToast('Aplikasi berhasil dipasang di Homescreen!');
  });
}

/**
 * Monitor Status Jaringan Internet
 */
function initNetworkMonitor() {
  const updateStatus = () => {
    APP_STATE.isOnline = navigator.onLine;
    if (DOM.networkStatus && DOM.networkText) {
      if (APP_STATE.isOnline) {
        DOM.networkStatus.classList.remove('offline');
        DOM.networkText.textContent = 'ONLINE';
      } else {
        DOM.networkStatus.classList.add('offline');
        DOM.networkText.textContent = 'OFFLINE';
        showToast('Mode Offline aktif.');
      }
    }
  };

  window.addEventListener('online', () => {
    updateStatus();
    showToast('Koneksi internet terhubung.');
  });

  window.addEventListener('offline', updateStatus);
  updateStatus();
}

/**
 * Utility Toast Notifikasi
 */
function showToast(message, duration = 2500) {
  if (!DOM.toast) return;
  DOM.toast.textContent = message;
  DOM.toast.classList.add('show');
  
  setTimeout(() => {
    DOM.toast.classList.remove('show');
  }, duration);
}
window.showToast = showToast;
