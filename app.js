/**
 * Eco-Gotchi: WebAR Tamagotchi Daur Ulang
 * Fase 3: Main Application Controller (Router, Wallet Sync, PWA & WebAR)
 */

// State App PWA & Navigasi
const APP_STATE = {
  currentView: 'lobby', // 'lobby' | 'ar'
  deferredPrompt: null,
  isInstalled: false,
  isOnline: navigator.onLine,
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
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
  modalWallet: document.getElementById('modal-wallet'),
  modalWalletBalance: document.getElementById('modal-wallet-balance'),
  txHistoryList: document.getElementById('tx-history-list'),
  btnOpenWallet: document.getElementById('btn-open-wallet'),
  btnCloseWallet: document.getElementById('btn-close-wallet'),

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
  console.log('[EcoGotchi] Inisialisasi Fase 3: Ekosistem Web & Dompet Token...');

  // 1. Inisialisasi PWA Core
  initServiceWorker();
  initPWAInstallPrompt();
  initNetworkMonitor();

  // 2. Inisialisasi Dompet Eco-Token
  if (window.WalletManager) {
    window.WalletManager.init();
    setupWalletSync();
  }

  // 3. Inisialisasi Game Engine Phaser 3 & Camera Manager
  if (window.GameManager) {
    window.GameManager.init('game-container');
  }

  if (window.CameraManager) {
    window.CameraManager.init('camera-feed');
    setupCameraControls();
  }

  // 4. Inisialisasi Navigasi & Modal
  setupNavigation();
  setupModals();
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
      
      // Nyalakan kamera otomatis saat masuk ke AR
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
      
      // Matikan kamera saat kembali ke Lobby untuk hemat baterai
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

    // Trigger resume & reposition monster agar pas dengan kontainer AR
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
  window.WalletManager.onChange((balance, transactions) => {
    // 1. Update teks saldo di Header & Lobby
    if (DOM.headerTokenVal) DOM.headerTokenVal.textContent = balance;
    if (DOM.lobbyTokenStat) DOM.lobbyTokenStat.textContent = `${balance} ECO`;
    if (DOM.modalWalletBalance) DOM.modalWalletBalance.textContent = `${balance} ECO`;

    // 2. Render Riwayat Transaksi
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
 * Konfigurasi Interaksi Modal (Dompet & Panduan)
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
