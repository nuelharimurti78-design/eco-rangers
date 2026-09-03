/**
 * Eco-Gotchi: WebAR Tamagotchi Daur Ulang
 * Fase 2 & 3: High-Performance WebAR Monster Engine
 * 100% Standalone, Zero-Dependency, Offline-Ready & Hardware-Accelerated
 */

const GameManager = {
  canvas: null,
  ctx: null,
  container: null,
  animFrameId: null,
  isRunning: false,

  // Monster State
  monster: {
    x: 0,
    y: 0,
    baseY: 0,
    radius: 42,
    scaleX: 1,
    scaleY: 1,
    targetScaleX: 1,
    targetScaleY: 1,
    isHappy: false,
    happyTimeout: null,
    isBlinking: false,
    blinkTimer: 0,
    jumpVelocity: 0,
    jumpY: 0,
    floatOffset: 0
  },

  // Reaction Speech Bubble
  speechBubble: {
    text: '',
    alpha: 0,
    yOffset: 0
  },

  // Particle System
  particles: [],

  /**
   * Inisialisasi Game Engine
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('[GameManager] Container tidak ditemukan:', containerId);
      return;
    }

    // Buat / Ambil Canvas
    let canvas = document.getElementById('ar-monster-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'ar-monster-canvas';
      this.container.appendChild(canvas);
    }

    this.canvas = canvas;
    this.ctx = this.canvas.getContext('2d', { alpha: true });

    this.resize();
    this.setupInteractions();
    this.startLoop();

    window.addEventListener('resize', () => this.resize());
    console.log('[GameManager] WebAR Monster Engine aktif & siap.');
  },

  /**
   * Mengatur ukuran canvas sesuai layar (dengan dukungan Retina / High-DPI)
   */
  resize() {
    if (!this.canvas || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : window.innerWidth;
    const height = rect.height > 0 ? rect.height : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Titik Tengah Monster
    this.monster.x = width / 2;
    this.monster.baseY = height * 0.52;
    this.monster.y = this.monster.baseY;

    console.log(`[GameManager] Canvas di-resize: ${width}x${height} (DPR: ${dpr})`);
  },

  /**
   * Pemicu saat masuk ke Mode AR
   */
  resumeAR() {
    this.resize();
    if (!this.isRunning) {
      this.startLoop();
    }
  },

  /**
   * Mulai Game Loop 60 FPS
   */
  startLoop() {
    this.isRunning = true;
    let lastTime = performance.now();

    const loop = (currentTime) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      this.update(currentTime, dt);
      this.render(currentTime);

      this.animFrameId = requestAnimationFrame(loop);
    };

    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(loop);
  },

  /**
   * Hentikan Game Loop
   */
  stopLoop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  },

  /**
   * Logika Update Fisika & Animasi
   */
  update(time, dt) {
    const m = this.monster;

    // 1. Animasi Melayang Sinusoidal (Idle Floating)
    m.floatOffset = Math.sin(time * 0.003) * 12;

    // 2. Fisika Lompat / Bounce
    if (m.jumpVelocity !== 0 || m.jumpY !== 0) {
      m.jumpY += m.jumpVelocity * dt * 60;
      m.jumpVelocity += 1.8 * dt * 60; // Gravitasi

      if (m.jumpY >= 0) {
        m.jumpY = 0;
        m.jumpVelocity = 0;
        // Squash saat mendarat
        m.scaleX = 1.35;
        m.scaleY = 0.75;
      }
    }

    m.y = m.baseY + m.floatOffset + m.jumpY;

    // 3. Interpolasi Squash & Stretch kembali ke normal (Spring Ease)
    m.scaleX += (m.targetScaleX - m.scaleX) * 0.15;
    m.scaleY += (m.targetScaleY - m.scaleY) * 0.15;

    // 4. Kedipan Mata Spontan
    m.blinkTimer += dt;
    if (m.blinkTimer > 3.5) {
      m.isBlinking = true;
      if (m.blinkTimer > 3.65) {
        m.isBlinking = false;
        m.blinkTimer = 0;
      }
    }

    // 5. Update Balon Kata
    if (this.speechBubble.alpha > 0) {
      this.speechBubble.yOffset -= 25 * dt;
      this.speechBubble.alpha -= 0.65 * dt;
      if (this.speechBubble.alpha < 0) this.speechBubble.alpha = 0;
    }

    // 6. Update Partikel
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.08 * dt * 60;
      p.life -= dt;
      p.scale = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  },

  /**
   * Render Canvas Transparan
   */
  render(time) {
    const ctx = this.ctx;
    const width = this.canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
    const height = this.canvas.height / (Math.min(window.devicePixelRatio || 1, 2));

    // Bersihkan canvas agar video kamera di bawahnya terlihat tembus pandang
    ctx.clearRect(0, 0, width, height);

    const m = this.monster;

    // -------------------------------------------------------------
    // 1. Hologram Ground Shadow (Bayangan melayang dinamis)
    // -------------------------------------------------------------
    const shadowY = m.baseY + 80;
    const shadowScale = Math.max(0.4, 1 - Math.abs(m.floatOffset + m.jumpY) / 100);
    const shadowWidth = 100 * shadowScale;
    const shadowHeight = 24 * shadowScale;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(m.x, shadowY, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 157, 0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // -------------------------------------------------------------
    // 2. Gambar Monster Slime
    // -------------------------------------------------------------
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(m.scaleX, m.scaleY);

    // Aura Cahaya Hijau Neon (Glow)
    ctx.shadowColor = 'rgba(0, 255, 157, 0.7)';
    ctx.shadowBlur = 18;

    // Badan Slime Utama (Hijau Neon Kenyal)
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.ellipse(0, 5, 48, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    // Kilau Cahaya Badan (Gel Highlight)
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#69f0ae';
    ctx.beginPath();
    ctx.ellipse(-16, -10, 24, 15, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Tunas Daun Eco di Atas Kepala
    ctx.fillStyle = '#76ff03';
    ctx.beginPath();
    ctx.ellipse(4, -38, 14, 9, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-6, -34, 11, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Tangkai Daun
    ctx.strokeStyle = '#00c853';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(0, -22);
    ctx.stroke();

    // Pipi Merona (Blush)
    ctx.fillStyle = 'rgba(255, 64, 129, 0.85)';
    ctx.beginPath();
    ctx.ellipse(-28, 12, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(28, 12, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mata & Mulut
    if (m.isHappy) {
      // Ekspresi Bahagia (^ _ ^)
      ctx.strokeStyle = '#0a1914';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(-14, 0, 6, Math.PI, 0, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(14, 0, 6, Math.PI, 0, false);
      ctx.stroke();

      // Mulut Terbuka Bahagia
      ctx.fillStyle = '#0a1914';
      ctx.beginPath();
      ctx.arc(0, 8, 7, 0, Math.PI, false);
      ctx.fill();
    } else if (m.isBlinking) {
      // Mata Berkedip (-)
      ctx.strokeStyle = '#0a1914';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, 2);
      ctx.lineTo(-8, 2);
      ctx.moveTo(8, 2);
      ctx.lineTo(20, 2);
      ctx.stroke();

      // Mulut Biasa
      ctx.beginPath();
      ctx.arc(0, 6, 4, 0.1 * Math.PI, 0.9 * Math.PI, false);
      ctx.stroke();
    } else {
      // Mata Bulat Normal
      ctx.fillStyle = '#0a1914';
      ctx.beginPath();
      ctx.ellipse(-14, 0, 5, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(14, 0, 5, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Kilau Mata Putih
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-15.5, -2, 2.2, 0, Math.PI * 2);
      ctx.arc(12.5, -2, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Mulut Senyum
      ctx.strokeStyle = '#0a1914';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 7, 4.5, 0.1 * Math.PI, 0.9 * Math.PI, false);
      ctx.stroke();
    }

    ctx.restore();

    // -------------------------------------------------------------
    // 3. Render Partikel Eco Sparkle
    // -------------------------------------------------------------
    for (const p of this.particles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // -------------------------------------------------------------
    // 4. Render Balon Kata / Pesan Reaksi Monster
    // -------------------------------------------------------------
    if (this.speechBubble.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.speechBubble.alpha;

      const bubbleX = m.x;
      const bubbleY = m.y - 75 + this.speechBubble.yOffset;

      ctx.font = '10px "Press Start 2P", monospace';
      const textWidth = ctx.measureText(this.speechBubble.text).width;
      const padX = 10;
      const padY = 6;
      const bgWidth = textWidth + padX * 2;
      const bgHeight = 22;

      // Background Balon Kata
      ctx.fillStyle = 'rgba(10, 25, 20, 0.92)';
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bubbleX - bgWidth / 2, bubbleY - bgHeight / 2, bgWidth, bgHeight, 6);
      ctx.fill();
      ctx.stroke();

      // Teks Pesan
      ctx.fillStyle = '#00ff9d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.speechBubble.text, bubbleX, bubbleY);

      ctx.restore();
    }
  },

  /**
   * Respon Interaksi saat Monster disentuh / diklik
   */
  handleTap(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const touchX = clientX - rect.left;
    const touchY = clientY - rect.top;

    const m = this.monster;
    const dist = Math.hypot(touchX - m.x, touchY - m.y);

    // Cek apakah sentuhan mengenai area monster (radius toleran ~80px)
    if (dist < 85) {
      this.triggerMonsterReaction();
      return true;
    }
    return false;
  },

  /**
   * Eksekusi Reaksi Monster (Lompat, Ekspresi Bahagia, Partikel, & Teks)
   */
  triggerMonsterReaction() {
    const m = this.monster;

    // 1. Lompat & Squash
    m.jumpVelocity = -12;
    m.scaleX = 0.85;
    m.scaleY = 1.35;

    // 2. Ubah Ekspresi ke Bahagia
    m.isHappy = true;
    if (m.happyTimeout) clearTimeout(m.happyTimeout);
    m.happyTimeout = setTimeout(() => {
      m.isHappy = false;
    }, 1400);

    // 3. Tampilkan Pesan Balon Kata
    const phrases = ['*Puri!* 🌱', 'Eco-Happy! ✨', 'Yay! 💚', '*Bounce!*', 'Purr~ 🌿'];
    this.speechBubble.text = phrases[Math.floor(Math.random() * phrases.length)];
    this.speechBubble.alpha = 1;
    this.speechBubble.yOffset = 0;

    // 4. Munculkan Partikel Bintang Eco
    const colors = ['#76ff03', '#00ff9d', '#69f0ae', '#ffffff'];
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 2;
      this.particles.push({
        x: m.x + (Math.random() - 0.5) * 40,
        y: m.y + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        radius: Math.random() * 3.5 + 2,
        scale: 1,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    if (window.showToast) {
      window.showToast('💚 Monster senang Anda merawatnya!');
    }
  },

  /**
   * Konfigurasi Event Listener Sentuhan / Pointer
   */
  setupInteractions() {
    const trigger = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      this.handleTap(clientX, clientY);
    };

    this.canvas.addEventListener('click', (e) => this.handleTap(e.clientX, e.clientY));
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.handleTap(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
  }
};

window.GameManager = GameManager;
