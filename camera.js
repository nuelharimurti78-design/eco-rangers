/**
 * Eco-Gotchi: WebAR Tamagotchi Daur Ulang
 * Fase 2: WebAR Camera Stream Controller
 */

const CameraManager = {
  videoElement: null,
  stream: null,
  isActive: false,
  facingMode: 'environment', // Default ke kamera belakang HP
  isSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),

  /**
   * Inisialisasi controller kamera
   */
  init(videoElementId) {
    this.videoElement = document.getElementById(videoElementId);
    if (!this.videoElement) {
      console.error('[CameraManager] Elemen video tidak ditemukan:', videoElementId);
      return;
    }
    console.log('[CameraManager] Modul kamera siap diinisialisasi.');
  },

  /**
   * Mulai streaming kamera
   */
  async startCamera() {
    if (!this.isSupported) {
      console.warn('[CameraManager] getUserMedia tidak didukung di browser ini.');
      this.triggerFallback('Perangkat/browser Anda tidak mendukung akses kamera.');
      return false;
    }

    // Hentikan stream aktif sebelumnya jika ada
    this.stopCamera();

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      console.log(`[CameraManager] Meminta izin kamera (${this.facingMode})...`);
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (this.videoElement) {
        this.videoElement.setAttribute('autoplay', 'true');
        this.videoElement.setAttribute('playsinline', 'true');
        this.videoElement.setAttribute('webkit-playsinline', 'true');
        this.videoElement.muted = true;
        this.videoElement.srcObject = this.stream;

        this.videoElement.onloadedmetadata = () => {
          if (window.GameManager) {
            window.GameManager.resumeAR();
          }
        };

        await this.videoElement.play();
        this.isActive = true;
        this.updateCameraUI(true);

        if (window.GameManager) {
          window.GameManager.resumeAR();
        }

        console.log('[CameraManager] Stream kamera berhasil aktif.');
        return true;
      }
    } catch (err) {
      console.error('[CameraManager] Gagal mengakses kamera:', err);
      let errorMsg = 'Izin kamera ditolak atau tidak tersedia.';
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Akses kamera ditolak. Berikan izin di browser Anda.';
      } else if (err.name === 'NotFoundError') {
        errorMsg = 'Kamera tidak ditemukan di perangkat ini.';
      }
      this.triggerFallback(errorMsg);
      return false;
    }
  },

  /**
   * Hentikan streaming kamera
   */
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isActive = false;
    this.updateCameraUI(false);
    console.log('[CameraManager] Stream kamera dihentikan.');
  },

  /**
   * Toggle / Switch antara kamera depan dan belakang
   */
  async switchCamera() {
    this.facingMode = (this.facingMode === 'environment') ? 'user' : 'environment';
    return await this.startCamera();
  },

  /**
   * Toggle status kamera (Hidup / Mati)
   */
  async toggleCamera() {
    if (this.isActive) {
      this.stopCamera();
      return false;
    } else {
      return await this.startCamera();
    }
  },

  /**
   * Fallback visual jika kamera tidak tersedia / diizinkan
   */
  triggerFallback(message) {
    this.isActive = false;
    this.updateCameraUI(false);
    const cameraOverlay = document.getElementById('camera-fallback-msg');
    if (cameraOverlay) {
      cameraOverlay.textContent = message;
      cameraOverlay.classList.remove('hidden');
    }
  },

  /**
   * Update visual indikator status kamera
   */
  updateCameraUI(active) {
    const camBtn = document.getElementById('btn-toggle-cam');
    const camStatus = document.getElementById('ar-cam-indicator');
    const fallbackBox = document.getElementById('camera-fallback-msg');
    const fallbackBg = document.getElementById('camera-fallback-bg');

    if (fallbackBox) {
      if (active) {
        fallbackBox.classList.add('hidden');
      } else {
        fallbackBox.classList.remove('hidden');
      }
    }

    if (fallbackBg) {
      fallbackBg.style.display = active ? 'none' : 'block';
    }

    if (camStatus) {
      camStatus.textContent = active ? 'CAM: LIVE' : 'CAM: SIM';
      camStatus.classList.toggle('active', active);
    }

    if (camBtn) {
      camBtn.classList.toggle('active', active);
    }
  }
};

window.CameraManager = CameraManager;
