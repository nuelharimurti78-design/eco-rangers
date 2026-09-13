/**
 * ECO-RANGERS: CORE GAME ENGINE & SYSTEM ARCHITECTURE
 * Handles Game Loop, Canvas Renderer, Native Web Audio API 8-Bit Synthesizer,
 * Custom Uploaded Student Monster Images, Monster Creation & Editing,
 * Tamagotchi Hunger, AR Spawning, Quizzes, Eco-Dex Catalog, Leaderboard,
 * 2-Step QR Scanner, Audit Logs, JSON Export/Import, Protected Admin Dashboard,
 * and Google Firebase Cloud Backend (Realtime DB & Storage) with Hybrid LocalStorage Fallback.
 */

(function () {
  'use strict';

  // INITIAL JSON SCHEMA CONSTRAINT (as required by PRD)
  const INITIAL_STATE = {
    player: {
      level: 1,
      exp: 0,
      hunger: 100,
      activeMonster: "slime_organik_01"
    },
    dailyScans: {
      date: QREngine.getTodayIsoDate(),
      count: 0,
      logs: []
    },
    inventory: {
      food_organic: 0,
      food_plastic: 0,
      food_bottle: 0
    },
    ecoDex: ["slime_organik_01"],
    quizBank: [
      {
        id: 1,
        question: "Sampah daun kering dan sisa makanan masuk ke tong warna apa?",
        options: ["Merah", "Hijau", "Kuning"],
        answer: 1 // Index 1 = Hijau (Organik)
      },
      {
        id: 2,
        question: "Berapa lama waktu yang dibutuhkan sampah plastik botol untuk terurai alami?",
        options: ["10 Tahun", "100 Tahun", "450 Tahun"],
        answer: 2 // Index 2 = 450 Tahun
      },
      {
        id: 3,
        question: "Prinsip 3R dalam pengelolaan sampah sekolah adalah...",
        options: ["Reduce, Reuse, Recycle", "Read, Run, Rest", "Remove, Repair, Replace"],
        answer: 0
      }
    ],
    customMonsters: [],
    hasSeenIntro: false
  };

  // ==========================================================================
  // HYBRID STORAGE & GOOGLE FIREBASE CLOUD BACKEND MANAGER
  // ==========================================================================
  const FirebaseManager = (function () {
    let app = null;
    let db = null;
    let storage = null;
    let isOnline = false;
    let currentConfig = null;

    function getConfigFromStorage() {
      const raw = localStorage.getItem("ecoRangersFirebaseConfig");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    function init(config, onStatusChange) {
      currentConfig = config || getConfigFromStorage();
      const statusBadge = document.getElementById("cloudStatusBadge");
      const statusText = document.getElementById("cloudStatusText");
      const statusBox = document.getElementById("firebaseConnectionStatus");

      if (!currentConfig || !currentConfig.apiKey || !window.firebase) {
        isOnline = false;
        if (statusBadge) {
          statusBadge.className = "cloud-status-badge offline";
          statusText.textContent = "OFFLINE";
        }
        if (statusBox) {
          statusBox.textContent = "Status Koneksi: 📴 OFFLINE (LocalStorage Fallback Mode)";
        }
        if (onStatusChange) onStatusChange(false);
        return false;
      }

      try {
        if (!firebase.apps.length) {
          app = firebase.initializeApp(currentConfig);
        } else {
          app = firebase.app();
        }

        db = firebase.database();
        storage = firebase.storage();

        // Listen to Realtime Database connection state
        const connectedRef = db.ref(".info/connected");
        connectedRef.on("value", (snap) => {
          if (snap.val() === true) {
            isOnline = true;
            if (statusBadge) {
              statusBadge.className = "cloud-status-badge online";
              statusText.textContent = "ONLINE";
            }
            if (statusBox) {
              statusBox.textContent = "Status Koneksi: 🌐 ONLINE (Firebase Realtime DB Synced)";
            }
            if (onStatusChange) onStatusChange(true);
          } else {
            isOnline = false;
            if (statusBadge) {
              statusBadge.className = "cloud-status-badge offline";
              statusText.textContent = "OFFLINE";
            }
            if (statusBox) {
              statusBox.textContent = "Status Koneksi: 📴 TERPUTUS (LocalStorage Fallback Mode)";
            }
            if (onStatusChange) onStatusChange(false);
          }
        });

        return true;
      } catch (err) {
        console.warn("Firebase Init Exception:", err);
        isOnline = false;
        if (statusBadge) {
          statusBadge.className = "cloud-status-badge offline";
          statusText.textContent = "OFFLINE";
        }
        if (statusBox) {
          statusBox.textContent = "Status Koneksi: 📴 ERROR CONFIG (LocalStorage Mode)";
        }
        if (onStatusChange) onStatusChange(false);
        return false;
      }
    }

    function getIsOnline() {
      return isOnline && db !== null;
    }

    function syncStateToCloud(state) {
      if (!getIsOnline()) return;
      try {
        db.ref("ecoRangers/player").set(state.player);
        db.ref("ecoRangers/inventory").set(state.inventory);
        db.ref("ecoRangers/dailyScans").set(state.dailyScans);
        db.ref("ecoRangers/ecoDex").set(state.ecoDex);
        db.ref("ecoRangers/customMonsters").set(state.customMonsters);
        db.ref("ecoRangers/quizBank").set(state.quizBank);
        if (state.leaderboard) {
          db.ref("ecoRangers/leaderboard").set(state.leaderboard);
        }
      } catch (e) {
        console.warn("Firebase Cloud Sync Write Error:", e);
      }
    }

    function uploadMonsterImage(monsterId, dataUrl, callback) {
      if (!getIsOnline() || !storage || !dataUrl) {
        callback(null);
        return;
      }

      try {
        const storageRef = storage.ref(`monsters/${monsterId}.png`);
        storageRef.putString(dataUrl, "data_url").then((snapshot) => {
          snapshot.ref.getDownloadURL().then((downloadUrl) => {
            callback(downloadUrl);
          }).catch(() => callback(null));
        }).catch(() => callback(null));
      } catch (e) {
        callback(null);
      }
    }

    function uploadScanProof(logId, dataUrl, callback) {
      if (!getIsOnline() || !storage || !dataUrl) {
        callback(null);
        return;
      }

      try {
        const storageRef = storage.ref(`scan_proofs/${logId}.jpg`);
        storageRef.putString(dataUrl, "data_url").then((snapshot) => {
          snapshot.ref.getDownloadURL().then((downloadUrl) => {
            callback(downloadUrl);
          }).catch(() => callback(null));
        }).catch(() => callback(null));
      } catch (e) {
        callback(null);
      }
    }

    function listenRealtimeCloudSync(state, onSyncUpdate) {
      if (!getIsOnline()) return;

      try {
        // Realtime Leaderboard Sync across student devices
        db.ref("ecoRangers/leaderboard").on("value", (snap) => {
          const val = snap.val();
          if (val) {
            state.leaderboard = val;
            localStorage.setItem("ecoRangersData", JSON.stringify(state));
            if (onSyncUpdate) onSyncUpdate("leaderboard");
          }
        });

        // Realtime Quiz Bank Sync
        db.ref("ecoRangers/quizBank").on("value", (snap) => {
          const val = snap.val();
          if (val) {
            state.quizBank = val;
            localStorage.setItem("ecoRangersData", JSON.stringify(state));
            if (onSyncUpdate) onSyncUpdate("quizBank");
          }
        });

        // Realtime Custom Monsters Sync
        db.ref("ecoRangers/customMonsters").on("value", (snap) => {
          const val = snap.val();
          if (val) {
            state.customMonsters = val;
            localStorage.setItem("ecoRangersData", JSON.stringify(state));
            if (onSyncUpdate) onSyncUpdate("customMonsters");
          }
        });
      } catch (e) {
        console.warn("Realtime Cloud Listener Error:", e);
      }
    }

    return {
      init,
      getConfigFromStorage,
      getIsOnline,
      syncStateToCloud,
      uploadMonsterImage,
      uploadScanProof,
      listenRealtimeCloudSync
    };
  })();

  // NATIVE WEB AUDIO API SYNTHESIZER (NO EXTERNAL FILES REQUIRED)
  const SoundFX = (function () {
    let audioCtx = null;

    function getAudioContext() {
      if (!audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          audioCtx = new AudioCtxClass();
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function playQrSuccess() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } catch (e) {}
    }

    function playLevelUp() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.12);
        });
      } catch (e) {}
    }

    function playEscape() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } catch (e) {}
    }

    function playClick() {
      try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch (e) {}
    }

    return {
      playQrSuccess,
      playLevelUp,
      playEscape,
      playClick
    };
  })();

  // MONSTER BASE DATABASE & EDU FACTS
  const BUILTIN_MONSTERS = {
    "slime_organik_01": {
      id: "slime_organik_01",
      name: "Organik Slime",
      type: "ORGANIC",
      baseLevel: 1,
      color: "#39ff14",
      fact: "Sampah organik (daun & sisa makanan) dapat diolah menjadi pupuk kompos alami untuk kebun sekolah Adiwiyata!"
    },
    "golem_plastik_01": {
      id: "golem_plastik_01",
      name: "Plastic Golem",
      type: "PLASTIC",
      baseLevel: 2,
      color: "#00f0ff",
      fact: "Sampah plastik butuh hingga 450 tahun untuk terurai. Mengurangi bungkus plastik menyelamatkan lingkungan!"
    },
    "imp_kaleng_01": {
      id: "imp_kaleng_01",
      name: "Metal Can Imp",
      type: "BOTTLE",
      baseLevel: 3,
      color: "#ffee00",
      fact: "Daur ulang 1 kaleng aluminium menghemat energi yang cukup untuk menyalakan TV selama 3 jam!"
    }
  };

  // LEADERBOARD DEFAULT CLASSES DATA
  const DEFAULT_LEADERBOARD = [
    { className: "Kelas 7A", points: 450 },
    { className: "Kelas 8B", points: 420 },
    { className: "Kelas 9A", points: 390 },
    { className: "Kelas 7B", points: 350 },
    { className: "Kelas 8A", points: 310 }
  ];

  // GAME ENGINE STATE
  let state = null;
  let activeTab = "HUNT";
  let wildMonster = null;
  let wildSpawnTimer = null;
  let hungerTimer = null;
  let animationFrameId = null;
  let currentQuiz = null;
  let currentWasteSnapshotUrl = null;
  let currentCustomSpriteDataUrl = null;
  let editingMonsterId = null;
  const imageCache = {};

  // DOM ELEMENTS
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const videoWebcam = document.getElementById("webcam");
  const cameraFallback = document.getElementById("cameraFallback");

  // HUD Elements
  const hudMonsterAvatar = document.getElementById("hudMonsterAvatar");
  const hudMonsterName = document.getElementById("hudMonsterName");
  const hudMonsterLevel = document.getElementById("hudMonsterLevel");
  const hudExpFill = document.getElementById("hudExpFill");
  const hudExpText = document.getElementById("hudExpText");
  const hudHungerFill = document.getElementById("hudHungerFill");
  const hudHungerText = document.getElementById("hudHungerText");
  const speechText = document.getElementById("speechText");
  const gameNotification = document.getElementById("gameNotification");
  const notificationText = document.getElementById("notificationText");

  // Modals
  const introModal = document.getElementById("introModal");
  const qrModal = document.getElementById("qrModal");
  const feedModal = document.getElementById("feedModal");
  const quizModal = document.getElementById("quizModal");
  const dexModal = document.getElementById("dexModal");
  const rankModal = document.getElementById("rankModal");
  const authModal = document.getElementById("authModal");
  const adminModal = document.getElementById("adminModal");

  // ==========================================================================
  // 1. STATE MANAGEMENT & STORAGE LAYER
  // ==========================================================================
  function loadState() {
    const raw = localStorage.getItem("ecoRangersData");
    if (!raw) {
      state = JSON.parse(JSON.stringify(INITIAL_STATE));
      saveState();
    } else {
      try {
        state = JSON.parse(raw);
        if (!state.player) state.player = INITIAL_STATE.player;
        if (!state.inventory) state.inventory = INITIAL_STATE.inventory;
        if (!state.dailyScans) state.dailyScans = INITIAL_STATE.dailyScans;
        if (!state.dailyScans.logs) state.dailyScans.logs = [];
        if (!state.ecoDex) state.ecoDex = INITIAL_STATE.ecoDex;
        if (!state.quizBank) state.quizBank = INITIAL_STATE.quizBank;
        if (!state.customMonsters) state.customMonsters = [];
        if (state.hasSeenIntro === undefined) state.hasSeenIntro = false;
      } catch (e) {
        state = JSON.parse(JSON.stringify(INITIAL_STATE));
        saveState();
      }
    }
  }

  function saveState() {
    localStorage.setItem("ecoRangersData", JSON.stringify(state));
    updateHUD();
    FirebaseManager.syncStateToCloud(state);
  }

  function getAllMonsters() {
    const all = { ...BUILTIN_MONSTERS };
    if (state.customMonsters && Array.isArray(state.customMonsters)) {
      state.customMonsters.forEach(m => {
        all[m.id] = m;
      });
    }
    return all;
  }

  function getActiveMonsterObj() {
    const all = getAllMonsters();
    return all[state.player.activeMonster] || BUILTIN_MONSTERS["slime_organik_01"];
  }

  // ==========================================================================
  // 2. CAMERA INITIALIZATION
  // ==========================================================================
  function initCamera() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment" } }
      })
      .then(stream => {
        videoWebcam.srcObject = stream;
        cameraFallback.classList.add("hidden");
      })
      .catch(() => {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            videoWebcam.srcObject = stream;
            cameraFallback.classList.add("hidden");
          })
          .catch(() => {
            cameraFallback.classList.remove("hidden");
          });
      });
    } else {
      cameraFallback.classList.remove("hidden");
    }
  }

  // ==========================================================================
  // 3. CANVAS 2D GAME LOOP & SPRITE RENDERER
  // ==========================================================================
  function resizeCanvas() {
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = canvas.clientHeight || window.innerHeight;
  }

  window.addEventListener("resize", resizeCanvas);

  function drawPixelGrid(x, y, pixelMatrix, pixelSize, mainColor) {
    ctx.save();
    for (let r = 0; r < pixelMatrix.length; r++) {
      for (let c = 0; c < pixelMatrix[r].length; c++) {
        const val = pixelMatrix[r][c];
        if (val === 0) continue;

        if (val === 1) ctx.fillStyle = mainColor;
        else if (val === 2) ctx.fillStyle = "#000000";
        else if (val === 3) ctx.fillStyle = "#ffffff";
        else if (val === 4) ctx.fillStyle = "#ff3366";

        ctx.fillRect(x + c * pixelSize, y + r * pixelSize, pixelSize, pixelSize);
      }
    }
    ctx.restore();
  }

  const MATRIX_SLIME = [
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,1,3,3,1,1,1,3,3,1,1,1,0,0,0],
    [0,1,1,2,2,1,1,1,2,2,1,1,1,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [1,1,1,1,1,4,4,4,1,1,1,1,1,1,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
  ];

  const MATRIX_GOLEM = [
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,3,3,1,1,3,3,1,0,0,0,0,0],
    [0,0,0,1,2,2,1,1,2,2,1,0,0,0,0,0],
    [0,0,0,1,1,1,4,4,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,1,1,0,1,1,1,1,1,1,0,1,1,0,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [1,1,1,1,1,3,1,1,3,1,1,1,1,1,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,0,1,1,1,1,1,1,0,1,1,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
  ];

  const MATRIX_IMP = [
    [0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0],
    [0,0,1,1,0,0,0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,1,1,3,3,1,1,3,3,1,1,0,0,0,0],
    [0,0,1,1,2,2,1,1,2,2,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,4,4,4,4,1,1,0,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,0],
    [1,1,0,1,1,1,1,1,1,1,1,0,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0],
    [0,0,0,1,1,0,0,0,0,1,1,0,0,0,0,0],
    [0,0,1,1,1,0,0,0,0,1,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
  ];

  function getMonsterMatrix(monsterObj) {
    if (monsterObj.id.includes("golem") || monsterObj.type === "PLASTIC") return MATRIX_GOLEM;
    if (monsterObj.id.includes("imp") || monsterObj.type === "BOTTLE") return MATRIX_IMP;
    return MATRIX_SLIME;
  }

  function renderMonsterOnCanvas(targetCtx, x, y, width, height, monsterObj, pixelSize) {
    if (monsterObj.spriteDataUrl) {
      let img = imageCache[monsterObj.id];
      if (!img || img.src !== monsterObj.spriteDataUrl) {
        img = new Image();
        img.src = monsterObj.spriteDataUrl;
        imageCache[monsterObj.id] = img;
      }

      if (img.complete && img.naturalWidth > 0) {
        targetCtx.save();
        targetCtx.imageSmoothingEnabled = false;
        targetCtx.drawImage(img, x, y, width, height);
        targetCtx.restore();
      } else {
        drawPixelGridOnCtx(targetCtx, x, y, getMonsterMatrix(monsterObj), pixelSize, monsterObj.color || "#39ff14");
      }
    } else {
      drawPixelGridOnCtx(targetCtx, x, y, getMonsterMatrix(monsterObj), pixelSize, monsterObj.color || "#39ff14");
    }
  }

  function gameLoop(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. RENDER ACTIVE PARTNER MONSTER
    const partner = getActiveMonsterObj();
    const pixelSize = Math.floor(Math.min(canvas.width, canvas.height) / 45) || 6;
    const spriteWidth = 16 * pixelSize;
    const spriteHeight = 16 * pixelSize;

    const bounceY = Math.sin(time / 300) * 10;
    const partnerX = (canvas.width - spriteWidth) / 2;
    const partnerY = (canvas.height - spriteHeight) / 2 + 30 + bounceY;

    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, partnerY + spriteHeight - 5, spriteWidth / 2, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    renderMonsterOnCanvas(ctx, partnerX, partnerY, spriteWidth, spriteHeight, partner, pixelSize);

    // 2. RENDER AR WILD MONSTER (IF SPAWNED)
    if (wildMonster) {
      const wildObj = getAllMonsters()[wildMonster.id] || BUILTIN_MONSTERS["slime_organik_01"];
      const wildPixelSize = Math.floor(pixelSize * 0.85);
      const wildW = 16 * wildPixelSize;
      const wildH = 16 * wildPixelSize;

      const wildFloat = Math.sin(time / 200 + wildMonster.x) * 6;
      const wx = wildMonster.x;
      const wy = wildMonster.y + wildFloat;

      ctx.strokeStyle = "#ff3366";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(wx + wildW / 2, wy + wildH / 2, wildW * 0.85 + Math.sin(time / 150) * 4, 0, Math.PI * 2);
      ctx.stroke();

      renderMonsterOnCanvas(ctx, wx, wy, wildW, wildH, wildObj, wildPixelSize);

      ctx.fillStyle = "#ffee00";
      ctx.font = "10px 'Press Start 2P', monospace";
      ctx.fillText(`LV.${wildMonster.level}`, wx, wy - 8);

      wildMonster.bounds = { x: wx, y: wy, width: wildW, height: wildH };
    }

    animationFrameId = requestAnimationFrame(gameLoop);
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (!wildMonster || !wildMonster.bounds) return;

    const rect = canvas.getBoundingClientRect();
    const touchX = e.clientX - rect.left;
    const touchY = e.clientY - rect.top;

    const b = wildMonster.bounds;
    if (touchX >= b.x - 15 && touchX <= b.x + b.width + 15 &&
        touchY >= b.y - 15 && touchY <= b.y + b.height + 15) {
      SoundFX.playClick();
      triggerARQuiz();
    }
  });

  // ==========================================================================
  // 4. HUNGER & SPEECH BUBBLE LOGIC
  // ==========================================================================
  function startHungerInterval() {
    if (hungerTimer) clearInterval(hungerTimer);
    hungerTimer = setInterval(() => {
      if (state.player.hunger > 0) {
        state.player.hunger = Math.max(0, state.player.hunger - 1);
        saveState();
      }
      updateSpeechBubble();
    }, 15000);
  }

  function updateSpeechBubble(actionText) {
    if (actionText) {
      speechText.textContent = actionText;
      return;
    }

    const partner = getActiveMonsterObj();
    const hunger = state.player.hunger;

    if (hunger <= 0) {
      speechText.textContent = `⚠️ Lapar sekali! ${partner.name} lemas, segera beri makan Eco-Food!`;
    } else if (hunger <= 30) {
      speechText.textContent = `🍖 Perut ${partner.name} mulai berbunyi! Scan QR Tong Sampah yuk!`;
    } else {
      const quotes = [
        `Haloo Ranger! Ayo pilah sampah di sekolah hari ini!`,
        `Ingat! Sampah Organik ke tong Hijau, Plastik ke Tong Kuning!`,
        `${partner.name} siap berburu monster sampah liar di AR!`,
        `Jaga kebersihan kelasmu agar menang di Leaderboard!`
      ];
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      speechText.textContent = randomQuote;
    }
  }

  function updateHUD() {
    const partner = getActiveMonsterObj();
    hudMonsterName.textContent = partner.name.toUpperCase();
    hudMonsterLevel.textContent = `LV.${state.player.level}`;

    const requiredExp = state.player.level * 100;
    const expPct = Math.min(100, Math.floor((state.player.exp / requiredExp) * 100));
    hudExpFill.style.width = `${expPct}%`;
    hudExpText.textContent = `${state.player.exp}/${requiredExp}`;

    hudHungerFill.style.width = `${state.player.hunger}%`;
    hudHungerText.textContent = `${state.player.hunger}%`;
  }

  function addPlayerEXP(amount) {
    state.player.exp += Math.floor(amount);
    const requiredExp = state.player.level * 100;

    if (state.player.exp >= requiredExp) {
      state.player.level += 1;
      state.player.exp -= requiredExp;
      SoundFX.playLevelUp();
      showNotification(`🎉 LEVEL UP! ${getActiveMonsterObj().name} SEKARANG LEVEL ${state.player.level}!`);
      updateSpeechBubble(`Horeee! Naik level ke Lv.${state.player.level}! Semakin kuat!`);
    }

    saveState();
  }

  function showNotification(msg, duration = 3000) {
    notificationText.textContent = msg;
    gameNotification.classList.remove("hidden");
    setTimeout(() => {
      gameNotification.classList.add("hidden");
    }, duration);
  }

  // ==========================================================================
  // 5. AR HUNTING SPAWN CONTROLLER & QUIZ
  // ==========================================================================
  function startARHuntingSpawns() {
    if (wildSpawnTimer) clearInterval(wildSpawnTimer);
    wildSpawnTimer = setInterval(() => {
      if (activeTab === "HUNT" && !wildMonster) {
        spawnWildMonster();
      }
    }, 10000);
  }

  function spawnWildMonster() {
    const all = Object.keys(getAllMonsters());
    const randomId = all[Math.floor(Math.random() * all.length)];
    
    const margin = 80;
    const maxX = Math.max(margin, canvas.width - margin * 2);
    const maxY = Math.max(margin, canvas.height - margin * 2);

    wildMonster = {
      id: randomId,
      x: margin + Math.random() * (maxX - margin),
      y: margin + Math.random() * (maxY - margin),
      level: Math.max(1, state.player.level + Math.floor(Math.random() * 3) - 1)
    };

    showNotification(`⚡ MONSTER LIAR MUNCUL DI AR! TEPUK UNTUK MENANGKAP!`);
  }

  function triggerARQuiz() {
    const quizList = state.quizBank && state.quizBank.length > 0 ? state.quizBank : INITIAL_STATE.quizBank;
    currentQuiz = quizList[Math.floor(Math.random() * quizList.length)];

    const quizQuestionEl = document.getElementById("quizQuestion");
    const quizOptionsEl = document.getElementById("quizOptions");
    const quizFeedbackEl = document.getElementById("quizFeedback");

    quizQuestionEl.textContent = currentQuiz.question;
    quizOptionsEl.innerHTML = "";
    quizFeedbackEl.classList.add("hidden");

    currentQuiz.options.forEach((optText, index) => {
      const btn = document.createElement("button");
      btn.className = "btn-retro quiz-opt-btn";
      btn.textContent = `${String.fromCharCode(65 + index)}. ${optText}`;
      btn.onclick = () => {
        SoundFX.playClick();
        evaluateQuizAnswer(index);
      };
      quizOptionsEl.appendChild(btn);
    });

    quizModal.classList.remove("hidden");
  }

  function evaluateQuizAnswer(selectedIndex) {
    const isCorrect = selectedIndex === currentQuiz.answer;
    const quizFeedbackEl = document.getElementById("quizFeedback");
    const wildObj = getAllMonsters()[wildMonster.id] || BUILTIN_MONSTERS["slime_organik_01"];

    quizFeedbackEl.classList.remove("hidden");

    if (!isCorrect) {
      SoundFX.playEscape();
      quizFeedbackEl.style.color = "var(--color-red)";
      quizFeedbackEl.textContent = `❌ JAWABAN SALAH! ${wildObj.name} KAGET DAN KABUR!`;
      
      setTimeout(() => {
        quizModal.classList.add("hidden");
        wildMonster = null;
      }, 1800);
      return;
    }

    quizFeedbackEl.style.color = "var(--color-green)";
    quizFeedbackEl.textContent = `✅ JAWABAN BENAR! MENGKALKULASI TINGKAT LEVEL...`;

    setTimeout(() => {
      const playerLvl = state.player.level;
      const wildLvl = wildMonster.level;
      let isCaught = playerLvl >= wildLvl ? true : Math.random() < 0.5;

      quizModal.classList.add("hidden");

      if (isCaught) {
        SoundFX.playLevelUp();
        if (!state.ecoDex.includes(wildMonster.id)) {
          state.ecoDex.push(wildMonster.id);
        }
        showNotification(`🎉 BERHASIL MENANGKAP ${wildObj.name.toUpperCase()}! (+50 EXP)`);
        addPlayerEXP(50);
        updateSpeechBubble(`Mantap! ${wildObj.name} berhasil dinetralkan & didaftarkan ke Eco-Dex!`);
      } else {
        SoundFX.playEscape();
        showNotification(`💨 LEVEL MONSTER LEBIH TINGGI (${wildLvl})! MONSTER BERHASIL LOLOS!`);
        updateSpeechBubble(`Sayang sekali monster terlalu lincah! Tingkatkan Level monstermu!`);
      }

      wildMonster = null;
    }, 1500);
  }

  // ==========================================================================
  // 6. ECO-FOOD FEEDING SYSTEM
  // ==========================================================================
  function renderFeedInventory() {
    const grid = document.getElementById("foodInventoryGrid");
    grid.innerHTML = "";

    const foodItems = [
      { key: "food_organic", name: "Eco-Food Organik", icon: "🍏", category: "ORGANIC" },
      { key: "food_plastic", name: "Eco-Food Plastik", icon: "🥤", category: "PLASTIC" },
      { key: "food_bottle", name: "Eco-Food Botol", icon: "🍾", category: "BOTTLE" }
    ];

    foodItems.forEach(item => {
      const count = state.inventory[item.key] || 0;
      const card = document.createElement("div");
      card.className = "food-card retro-box";
      card.innerHTML = `
        <div class="food-icon">${item.icon}</div>
        <div class="food-name">${item.name}</div>
        <div class="food-count">${count} STOK</div>
      `;

      card.onclick = () => {
        SoundFX.playClick();
        feedActiveMonster(item);
      };
      grid.appendChild(card);
    });
  }

  function feedActiveMonster(foodItem) {
    const count = state.inventory[foodItem.key] || 0;
    if (count <= 0) {
      alert("Stok Eco-Food ini habis! Scan QR Tong Sampah di sekolah untuk mendapatkannya!");
      return;
    }

    state.inventory[foodItem.key] -= 1;

    const partner = getActiveMonsterObj();
    const isFavorite = partner.type === foodItem.category;

    let baseExp = 40;
    let hungerRestored = 35;
    let bonusMessage = "";

    if (isFavorite) {
      baseExp = 80;
      hungerRestored = 50;
      bonusMessage = `🌟 MAKANAN FAVORIT! BONUS 100% EXP (+${baseExp} EXP)!`;
    } else {
      baseExp = 40;
      bonusMessage = `🍖 MAKANAN BIASA (+${baseExp} EXP)`;
    }

    state.player.hunger = Math.min(100, state.player.hunger + hungerRestored);
    addPlayerEXP(baseExp);
    
    feedModal.classList.add("hidden");
    showNotification(bonusMessage);
    updateSpeechBubble(`Nyam nyam! ${partner.name} sangat senang makan! ${bonusMessage}`);
  }

  // ==========================================================================
  // 7. ECO-DEX CATALOG & LEADERBOARD MANAGERS
  // ==========================================================================
  function renderEcoDex() {
    const grid = document.getElementById("dexGrid");
    const detailPanel = document.getElementById("dexDetailPanel");
    grid.innerHTML = "";

    const allMonsters = getAllMonsters();
    const monsterKeys = Object.keys(allMonsters);
    const totalSlots = Math.max(9, monsterKeys.length);

    for (let i = 0; i < totalSlots; i++) {
      const mId = monsterKeys[i];
      const mObj = mId ? allMonsters[mId] : null;
      const isUnlocked = mId && state.ecoDex.includes(mId);

      const slot = document.createElement("div");
      slot.className = `dex-item retro-box ${isUnlocked ? '' : 'locked'}`;

      if (mObj) {
        const miniCanvas = document.createElement("canvas");
        miniCanvas.width = 44;
        miniCanvas.height = 44;
        const mCtx = miniCanvas.getContext("2d");
        
        renderMonsterOnCanvas(mCtx, 0, 0, 44, 44, mObj, 2.5);

        slot.appendChild(miniCanvas);

        const nameLabel = document.createElement("span");
        nameLabel.className = "dex-item-name";
        nameLabel.textContent = isUnlocked ? mObj.name : "???";
        slot.appendChild(nameLabel);

        if (isUnlocked) {
          slot.onclick = () => {
            SoundFX.playClick();
            document.querySelectorAll(".dex-item").forEach(el => el.classList.remove("active-selected"));
            slot.classList.add("active-selected");

            state.player.activeMonster = mObj.id;
            saveState();

            detailPanel.classList.remove("hidden");
            document.getElementById("dexDetailName").textContent = `${mObj.name} (LV.${mObj.baseLevel})`;
            document.getElementById("dexDetailType").textContent = `Tipe Trash: ${mObj.type}`;
            document.getElementById("dexDetailFact").textContent = `💡 Fakta Adiwiyata: ${mObj.fact}`;
            
            showNotification(`👾 PARTNER MONSTER DIPILIH: ${mObj.name.toUpperCase()}`);
            updateSpeechBubble(`Monster partner kamu sekarang adalah ${mObj.name}!`);
          };
        }
      } else {
        slot.innerHTML = `<span style="font-size: 18px; color: #444;">🔒</span>`;
      }

      grid.appendChild(slot);
    }
  }

  function drawPixelGridOnCtx(cCtx, x, y, matrix, size, color) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const val = matrix[r][c];
        if (val === 0) continue;
        if (val === 1) cCtx.fillStyle = color;
        else if (val === 2) cCtx.fillStyle = "#000000";
        else if (val === 3) cCtx.fillStyle = "#ffffff";
        else if (val === 4) cCtx.fillStyle = "#ff3366";
        cCtx.fillRect(x + c * size, y + r * size, size, size);
      }
    }
  }

  function renderLeaderboard() {
    const list = document.getElementById("leaderboardList");
    list.innerHTML = "";

    const ranks = state.leaderboard || DEFAULT_LEADERBOARD;
    const sorted = [...ranks].sort((a, b) => b.points - a.points);

    sorted.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "rank-item retro-box";
      const medal = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : `#${index + 1}`));
      li.innerHTML = `
        <span class="pos">${medal}</span>
        <span class="name">${item.className}</span>
        <span class="pts">${item.points} PTS</span>
      `;
      list.appendChild(li);
    });
  }

  // ==========================================================================
  // 8. ADMIN DASHBOARD, AUDIT LOGS & FIREBASE HYBRID SETUP
  // ==========================================================================
  function resetMonsterForm() {
    editingMonsterId = null;
    document.getElementById("monsterFormTitle").textContent = "👾 TAMBAH MONSTER ADIWIYATA KARYA SISWA";
    document.getElementById("mInputName").value = "";
    document.getElementById("mInputType").value = "ORGANIC";
    document.getElementById("mInputLevel").value = "1";
    document.getElementById("mInputFact").value = "";
    document.getElementById("mInputColor").value = "#39ff14";
    document.getElementById("mInputImage").value = "";
    currentCustomSpriteDataUrl = null;

    document.getElementById("mImagePreviewContainer").classList.add("hidden");
    document.getElementById("btnSaveMonster").textContent = "SIMPAN MONSTER KE ECO-DEX";
    document.getElementById("btnCancelEditMonster").classList.add("hidden");
  }

  function renderAdminMonsterList() {
    const list = document.getElementById("adminMonsterList");
    if (!list) return;
    list.innerHTML = "";

    const customs = state.customMonsters || [];

    if (customs.length === 0) {
      list.innerHTML = `<p class="desc text-center">Belum ada monster buatan siswa yang ditambahkan.</p>`;
      return;
    }

    customs.forEach((m) => {
      const li = document.createElement("li");
      li.className = "quiz-admin-item";

      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 24;
      thumbCanvas.height = 24;
      thumbCanvas.style.cssText = "width:24px; height:24px; image-rendering:pixelated; margin-right:6px;";
      const tCtx = thumbCanvas.getContext("2d");
      renderMonsterOnCanvas(tCtx, 0, 0, 24, 24, m, 1.5);

      const titleSpan = document.createElement("span");
      titleSpan.style.cssText = "flex:1; display:flex; align-items:center;";
      titleSpan.appendChild(thumbCanvas);
      
      const textNode = document.createElement("span");
      textNode.textContent = `${m.name} (LV.${m.baseLevel} - ${m.type})`;
      titleSpan.appendChild(textNode);

      const btnGroup = document.createElement("div");

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn-retro btn-warning";
      btnEdit.style.cssText = "padding:2px 6px; font-size:7px; margin-right:4px;";
      btnEdit.textContent = "✏️ EDIT";
      btnEdit.onclick = () => {
        SoundFX.playClick();
        editMonster(m);
      };

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn-retro btn-danger";
      btnDelete.style.cssText = "padding:2px 6px; font-size:7px;";
      btnDelete.textContent = "🗑️ HAPUS";
      btnDelete.onclick = () => {
        SoundFX.playClick();
        deleteMonster(m);
      };

      btnGroup.appendChild(btnEdit);
      btnGroup.appendChild(btnDelete);

      li.appendChild(titleSpan);
      li.appendChild(btnGroup);

      list.appendChild(li);
    });
  }

  function editMonster(m) {
    editingMonsterId = m.id;
    document.getElementById("monsterFormTitle").textContent = `✏️ EDIT MONSTER "${m.name.toUpperCase()}"`;
    document.getElementById("mInputName").value = m.name;
    document.getElementById("mInputType").value = m.type;
    document.getElementById("mInputLevel").value = m.baseLevel;
    document.getElementById("mInputFact").value = m.fact || "";
    document.getElementById("mInputColor").value = m.color || "#39ff14";

    const mImagePreviewContainer = document.getElementById("mImagePreviewContainer");
    const mImagePreviewCanvas = document.getElementById("mImagePreviewCanvas");

    if (m.spriteDataUrl) {
      currentCustomSpriteDataUrl = m.spriteDataUrl;
      const img = new Image();
      img.onload = () => {
        mImagePreviewCanvas.width = 32;
        mImagePreviewCanvas.height = 32;
        const pCtx = mImagePreviewCanvas.getContext("2d");
        pCtx.clearRect(0, 0, 32, 32);
        pCtx.imageSmoothingEnabled = false;
        pCtx.drawImage(img, 0, 0, 32, 32);
        mImagePreviewContainer.classList.remove("hidden");
      };
      img.src = m.spriteDataUrl;
    } else {
      currentCustomSpriteDataUrl = null;
      mImagePreviewContainer.classList.add("hidden");
    }

    document.getElementById("btnSaveMonster").textContent = "💾 UPDATE MONSTER";
    document.getElementById("btnCancelEditMonster").classList.remove("hidden");
    document.getElementById("monsterFormTitle").scrollIntoView({ behavior: 'smooth' });
  }

  function deleteMonster(m) {
    if (confirm(`⚠️ Yakin ingin menghapus monster "${m.name}" dari Eco-Dex?`)) {
      state.customMonsters = state.customMonsters.filter(x => x.id !== m.id);
      state.ecoDex = state.ecoDex.filter(id => id !== m.id);

      if (state.player.activeMonster === m.id) {
        state.player.activeMonster = "slime_organik_01";
      }

      delete imageCache[m.id];
      saveState();
      renderAdminMonsterList();
      alert(`🗑️ Monster "${m.name}" berhasil dihapus.`);
    }
  }

  function renderAdminScanLogs() {
    const list = document.getElementById("adminScanLogsList");
    if (!list) return;
    list.innerHTML = "";

    const logs = (state.dailyScans && state.dailyScans.logs) ? state.dailyScans.logs : [];

    if (logs.length === 0) {
      list.innerHTML = `<p class="desc text-center">Belum ada log bukti foto scan hari ini.</p>`;
      return;
    }

    logs.forEach((log) => {
      const card = document.createElement("div");
      card.className = "scan-log-card retro-box";

      const photoHtml = log.photo ? `<img src="${log.photo}" class="scan-log-img" alt="Bukti Foto">` : `<div class="scan-log-img text-center">📷 NO PHOTO</div>`;

      card.innerHTML = `
        ${photoHtml}
        <div class="scan-log-info">
          <div><strong>#${log.count} - Kategori ${log.category}</strong></div>
          <div class="scan-log-tier">${log.tierText}</div>
          <div class="scan-log-time">📅 ${log.date} ${log.timestamp}</div>
        </div>
      `;
      list.appendChild(card);
    });
  }

  function populateFirebaseConfigForm() {
    const cfg = FirebaseManager.getConfigFromStorage();
    if (cfg) {
      if (document.getElementById("fbApiKey")) document.getElementById("fbApiKey").value = cfg.apiKey || "";
      if (document.getElementById("fbAuthDomain")) document.getElementById("fbAuthDomain").value = cfg.authDomain || "";
      if (document.getElementById("fbDatabaseUrl")) document.getElementById("fbDatabaseUrl").value = cfg.databaseURL || "";
      if (document.getElementById("fbProjectId")) document.getElementById("fbProjectId").value = cfg.projectId || "";
      if (document.getElementById("fbStorageBucket")) document.getElementById("fbStorageBucket").value = cfg.storageBucket || "";
      if (document.getElementById("fbMessagingSenderId")) document.getElementById("fbMessagingSenderId").value = cfg.messagingSenderId || "";
      if (document.getElementById("fbAppId")) document.getElementById("fbAppId").value = cfg.appId || "";
    }
  }

  function setupAdminPanel() {
    const btnAdminTrigger = document.getElementById("btnAdminTrigger");
    const btnAuthSubmit = document.getElementById("btnAuthSubmit");
    const adminPinInput = document.getElementById("adminPinInput");
    const authError = document.getElementById("authError");
    const btnAdminExit = document.getElementById("btnAdminExit");

    const mInputImage = document.getElementById("mInputImage");
    const mImagePreviewContainer = document.getElementById("mImagePreviewContainer");
    const mImagePreviewCanvas = document.getElementById("mImagePreviewCanvas");
    const btnCancelEditMonster = document.getElementById("btnCancelEditMonster");
    const btnClearLogs = document.getElementById("btnClearLogs");

    const btnExportJson = document.getElementById("btnExportJson");
    const btnImportJsonTrigger = document.getElementById("btnImportJsonTrigger");
    const jsonFileInput = document.getElementById("jsonFileInput");

    const btnSaveFirebaseConfig = document.getElementById("btnSaveFirebaseConfig");
    const btnDisconnectFirebase = document.getElementById("btnDisconnectFirebase");

    btnAdminTrigger.onclick = () => {
      SoundFX.playClick();
      adminPinInput.value = "";
      authError.classList.add("hidden");
      authModal.classList.remove("hidden");
    };

    btnAuthSubmit.onclick = () => {
      SoundFX.playClick();
      const pin = adminPinInput.value.trim();
      if (pin === "admin123") {
        authModal.classList.add("hidden");
        adminModal.classList.remove("hidden");
        populateFirebaseConfigForm();
        renderAdminScanLogs();
        renderAdminMonsterList();
        renderAdminQuizList();
        renderAdminRankTable();
      } else {
        authError.classList.remove("hidden");
      }
    };

    btnAdminExit.onclick = () => {
      SoundFX.playClick();
      adminModal.classList.add("hidden");
    };

    document.querySelectorAll(".admin-tabs .tab-btn").forEach(btn => {
      btn.onclick = () => {
        SoundFX.playClick();
        document.querySelectorAll(".admin-tabs .tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");

        if (tabId === "tabLogs") {
          renderAdminScanLogs();
        } else if (tabId === "tabMonster") {
          renderAdminMonsterList();
        } else if (tabId === "tabFirebase") {
          populateFirebaseConfigForm();
        }
      };
    });

    // FIREBASE CONFIGURATION SAVE & DISCONNECT HANDLERS
    if (btnSaveFirebaseConfig) {
      btnSaveFirebaseConfig.onclick = () => {
        SoundFX.playClick();
        const config = {
          apiKey: document.getElementById("fbApiKey").value.trim(),
          authDomain: document.getElementById("fbAuthDomain").value.trim(),
          databaseURL: document.getElementById("fbDatabaseUrl").value.trim(),
          projectId: document.getElementById("fbProjectId").value.trim(),
          storageBucket: document.getElementById("fbStorageBucket").value.trim(),
          messagingSenderId: document.getElementById("fbMessagingSenderId").value.trim(),
          appId: document.getElementById("fbAppId").value.trim()
        };

        if (!config.apiKey || !config.databaseURL) {
          alert("Lengkapi minimal apiKey dan databaseURL Firebase!");
          return;
        }

        localStorage.setItem("ecoRangersFirebaseConfig", JSON.stringify(config));
        const ok = FirebaseManager.init(config, (online) => {
          if (online) {
            FirebaseManager.syncStateToCloud(state);
            FirebaseManager.listenRealtimeCloudSync(state, (topic) => {
              if (topic === "leaderboard") renderLeaderboard();
            });
          }
        });

        if (ok) {
          alert("💾 KREDENSIAL FIREBASE BERHASIL DISIMPAN & MEMULAI KONEKSI CLOUD!");
        } else {
          alert("⚠️ Gagal menginisialisasi Firebase. Periksa kredensial.");
        }
      };
    }

    if (btnDisconnectFirebase) {
      btnDisconnectFirebase.onclick = () => {
        SoundFX.playClick();
        if (confirm("⚠️ Yakin memutuskan koneksi Firebase dan kembali ke mode LocalStorage Offline?")) {
          localStorage.removeItem("ecoRangersFirebaseConfig");
          alert("🔌 FIREBASE TERPUTUS. Mode offline LocalStorage aktif.");
          location.reload();
        }
      };
    }

    if (btnClearLogs) {
      btnClearLogs.onclick = () => {
        SoundFX.playClick();
        if (confirm("⚠️ Yakin ingin menghapus seluruh log bukti foto scan hari ini?")) {
          if (state.dailyScans) state.dailyScans.logs = [];
          saveState();
          renderAdminScanLogs();
          alert("🗑️ Seluruh Log Audit Bukti Foto Berhasil Dihapus.");
        }
      };
    }

    // EXPORT JSON DATA BACKUP
    if (btnExportJson) {
      btnExportJson.onclick = () => {
        SoundFX.playClick();
        const dataStr = JSON.stringify(state, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `eco-rangers-backup-${QREngine.getTodayIsoDate()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };
    }

    // IMPORT JSON DATA BACKUP
    if (btnImportJsonTrigger && jsonFileInput) {
      btnImportJsonTrigger.onclick = () => {
        SoundFX.playClick();
        jsonFileInput.click();
      };

      jsonFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target.result);
            if (!imported.player || !imported.inventory || !imported.dailyScans) {
              alert("❌ Berkas JSON tidak valid! Pastikan format struktur Eco-Rangers sesuai.");
              return;
            }

            state = imported;
            saveState();
            alert("✅ IMPOR DATA JSON BERHASIL! Seluruh state game telah diperbarui.");
            location.reload();
          } catch (err) {
            alert("❌ Gagal membaca berkas JSON. Format tidak sesuai.");
          }
        };
        reader.readAsText(file);
      };
    }

    mInputImage.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) {
        if (!editingMonsterId) {
          mImagePreviewContainer.classList.add("hidden");
          currentCustomSpriteDataUrl = null;
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          mImagePreviewCanvas.width = 32;
          mImagePreviewCanvas.height = 32;
          const pCtx = mImagePreviewCanvas.getContext("2d");
          pCtx.clearRect(0, 0, 32, 32);
          pCtx.imageSmoothingEnabled = false;
          pCtx.drawImage(img, 0, 0, 32, 32);

          currentCustomSpriteDataUrl = mImagePreviewCanvas.toDataURL("image/png");
          mImagePreviewContainer.classList.remove("hidden");
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    };

    btnCancelEditMonster.onclick = () => {
      SoundFX.playClick();
      resetMonsterForm();
    };

    // 1. Tab QR Code Generator
    document.getElementById("btnGenerateQr").onclick = () => {
      SoundFX.playClick();
      const cat = document.getElementById("qrSelectCategory").value;
      const loc = document.getElementById("qrInputLocation").value;
      const display = document.getElementById("adminQrDisplay");
      const downloadBtn = document.getElementById("btnDownloadQr");

      QREngine.generateAdminQr(cat, loc, display, downloadBtn);
    };

    // 2. Tab Custom Monster Save / Update Form (with Firebase Storage & LocalStorage Hybrid)
    document.getElementById("btnSaveMonster").onclick = () => {
      SoundFX.playClick();
      const name = document.getElementById("mInputName").value.trim();
      const type = document.getElementById("mInputType").value;
      const level = parseInt(document.getElementById("mInputLevel").value) || 1;
      const fact = document.getElementById("mInputFact").value.trim();
      const color = document.getElementById("mInputColor").value;

      if (!name) {
        alert("Masukkan nama monster karya siswa!");
        return;
      }

      const targetId = editingMonsterId || `custom_monster_${Date.now()}`;

      function finishSaveMonster(finalSpriteUrl) {
        if (editingMonsterId) {
          const idx = state.customMonsters.findIndex(m => m.id === editingMonsterId);
          if (idx !== -1) {
            state.customMonsters[idx].name = name;
            state.customMonsters[idx].type = type;
            state.customMonsters[idx].baseLevel = level;
            state.customMonsters[idx].fact = fact || "Monster daur ulang karya siswa Adiwiyata!";
            state.customMonsters[idx].color = color;
            if (finalSpriteUrl) {
              state.customMonsters[idx].spriteDataUrl = finalSpriteUrl;
              delete imageCache[editingMonsterId];
            }
            alert(`✅ Monster "${name}" Berhasil Di-update!`);
          }
        } else {
          const newMonster = {
            id: targetId,
            name: name,
            type: type,
            baseLevel: level,
            color: color,
            fact: fact || "Monster daur ulang karya siswa Adiwiyata!",
            spriteDataUrl: finalSpriteUrl || currentCustomSpriteDataUrl || null
          };

          state.customMonsters.push(newMonster);
          if (!state.ecoDex.includes(targetId)) {
            state.ecoDex.push(targetId);
          }
          alert(`✅ Monster Baru "${name}" Berhasil Disimpan ke Eco-Dex!`);
        }

        saveState();
        resetMonsterForm();
        renderAdminMonsterList();
      }

      // Check if online and custom image uploaded -> Upload to Firebase Storage
      if (currentCustomSpriteDataUrl && FirebaseManager.getIsOnline()) {
        showNotification("☁️ MENGUNGGAH SPRITE KE FIREBASE STORAGE...");
        FirebaseManager.uploadMonsterImage(targetId, currentCustomSpriteDataUrl, (cloudUrl) => {
          finishSaveMonster(cloudUrl || currentCustomSpriteDataUrl);
        });
      } else {
        finishSaveMonster(currentCustomSpriteDataUrl);
      }
    };

    // 3. Tab Quiz Bank
    document.getElementById("btnAddQuiz").onclick = () => {
      SoundFX.playClick();
      const q = document.getElementById("qInputQuestion").value.trim();
      const o0 = document.getElementById("qInputOpt0").value.trim();
      const o1 = document.getElementById("qInputOpt1").value.trim();
      const o2 = document.getElementById("qInputOpt2").value.trim();
      const ans = parseInt(document.getElementById("qInputAnswer").value);

      if (!q || !o0 || !o1 || !o2) {
        alert("Lengkapi semua field soal dan 3 pilihan!");
        return;
      }

      const newQuiz = {
        id: Date.now(),
        question: q,
        options: [o0, o1, o2],
        answer: ans
      };

      state.quizBank.push(newQuiz);
      saveState();
      renderAdminQuizList();
      alert("✅ Soal Kuis Baru Berhasil Ditambahkan!");

      document.getElementById("qInputQuestion").value = "";
      document.getElementById("qInputOpt0").value = "";
      document.getElementById("qInputOpt1").value = "";
      document.getElementById("qInputOpt2").value = "";
    };

    // 4. Tab Leaderboard Update
    document.getElementById("btnUpdateRank").onclick = () => {
      SoundFX.playClick();
      const cName = document.getElementById("rInputClass").value.trim();
      const pts = parseInt(document.getElementById("rInputPoints").value) || 0;

      if (!cName) {
        alert("Masukkan nama kelas!");
        return;
      }

      if (!state.leaderboard) state.leaderboard = [...DEFAULT_LEADERBOARD];

      const existing = state.leaderboard.find(x => x.className.toLowerCase() === cName.toLowerCase());
      if (existing) {
        existing.points += pts;
      } else {
        state.leaderboard.push({ className: cName, points: pts });
      }

      saveState();
      renderAdminRankTable();
      alert(`✅ Poin Kebersihan ${cName} Berhasil Diupdate!`);
    };

    // 5. Tab Demo Suite
    document.getElementById("btnDemoSpawn").onclick = () => {
      SoundFX.playClick();
      activeTab = "HUNT";
      spawnWildMonster();
      adminModal.classList.add("hidden");
    };

    document.getElementById("btnDemoLevelUp").onclick = () => {
      addPlayerEXP(1000);
      alert("🚀 Instant Level Up +1000 EXP Berhasil!");
    };

    document.getElementById("btnDemoResetScan").onclick = () => {
      SoundFX.playClick();
      state.dailyScans = {
        date: QREngine.getTodayIsoDate(),
        count: 0,
        logs: []
      };
      saveState();
      renderAdminScanLogs();
      alert("🔄 Hitungan Daily Scan Berhasil Direset ke 0!");
    };

    document.getElementById("btnDemoResetAll").onclick = () => {
      SoundFX.playClick();
      if (confirm("⚠️ Yakin reset semua data game ke inisial JSON?")) {
        localStorage.removeItem("ecoRangersData");
        loadState();
        alert("Reset Selesai!");
        location.reload();
      }
    };
  }

  function renderAdminQuizList() {
    const list = document.getElementById("adminQuizList");
    list.innerHTML = "";
    const bank = state.quizBank || [];
    bank.forEach((q, idx) => {
      const li = document.createElement("li");
      li.className = "quiz-admin-item";
      li.innerHTML = `
        <span>${idx + 1}. ${q.question}</span>
        <button class="btn-retro btn-danger" style="padding:2px 6px; font-size:7px;">HAPUS</button>
      `;
      li.querySelector("button").onclick = () => {
        SoundFX.playClick();
        state.quizBank.splice(idx, 1);
        saveState();
        renderAdminQuizList();
      };
      list.appendChild(li);
    });
  }

  function renderAdminRankTable() {
    const container = document.getElementById("adminRankTable");
    const ranks = state.leaderboard || DEFAULT_LEADERBOARD;
    let html = `<table style="width:100%; font-size:8px; border-collapse:collapse; text-align:left;">`;
    html += `<tr style="border-bottom:1px solid #555;"><th>Kelas</th><th>Poin Total</th></tr>`;
    ranks.forEach(r => {
      html += `<tr><td style="padding:4px;">${r.className}</td><td style="padding:4px; color:var(--color-green);">${r.points} PTS</td></tr>`;
    });
    html += `</table>`;
    container.innerHTML = html;
  }

  // ==========================================================================
  // 9. PROLOG BOOT-UP SEQUENCE & 2-STEP NAVIGATION BINDINGS
  // ==========================================================================
  function runIntroBootSequence() {
    if (state.hasSeenIntro) {
      introModal.classList.add("hidden");
      return;
    }

    introModal.classList.remove("hidden");
    const typewriterEl = document.getElementById("typewriterText");
    const btnStartGame = document.getElementById("btnStartGame");

    const lines = [
      "SYSTEM INITIALIZED...",
      "WARNING: Energi Sampah Digital merembes di area sekolah!",
      "Gunakan Radar Eco-Detector untuk memilah sampah fisik, merawat partner monster, dan menetralkan monster liar."
    ];

    let lineIdx = 0;
    let charIdx = 0;
    typewriterEl.textContent = "";

    function typeChar() {
      if (lineIdx < lines.length) {
        if (charIdx < lines[lineIdx].length) {
          typewriterEl.textContent += lines[lineIdx].charAt(charIdx);
          charIdx++;
          setTimeout(typeChar, 35);
        } else {
          typewriterEl.textContent += "\n\n";
          lineIdx++;
          charIdx = 0;
          setTimeout(typeChar, 400);
        }
      } else {
        btnStartGame.classList.remove("hidden");
      }
    }

    typeChar();

    btnStartGame.onclick = () => {
      SoundFX.playLevelUp();
      state.hasSeenIntro = true;
      saveState();
      introModal.classList.add("hidden");
    };
  }

  function setupNavigation() {
    const btnScan = document.getElementById("btnNavScan");
    const btnFeed = document.getElementById("btnNavFeed");
    const btnHunt = document.getElementById("btnNavHunt");
    const btnDex = document.getElementById("btnNavDex");
    const btnRank = document.getElementById("btnNavRank");

    const btnTakeTrashPhoto = document.getElementById("btnTakeTrashPhoto");
    const btnRetakePhoto = document.getElementById("btnRetakePhoto");
    const qrStep1Container = document.getElementById("qrStep1Container");
    const qrStep2Container = document.getElementById("qrStep2Container");
    const trashSnapshotCanvas = document.getElementById("trashSnapshotCanvas");
    const trashSnapshotPlaceholder = document.getElementById("trashSnapshotPlaceholder");
    const proofThumbnailContainer = document.getElementById("proofThumbnailContainer");
    const qrStatus = document.getElementById("qrStatus");
    const qrScanCanvas = document.getElementById("qrScanCanvas");

    const allNavs = [btnScan, btnFeed, btnHunt, btnDex, btnRank];

    function setActiveNav(activeBtn) {
      allNavs.forEach(b => b.classList.remove("active"));
      activeBtn.classList.add("active");
    }

    document.querySelectorAll(".closeModal").forEach(btn => {
      btn.onclick = () => {
        SoundFX.playClick();
        qrModal.classList.add("hidden");
        feedModal.classList.add("hidden");
        dexModal.classList.add("hidden");
        rankModal.classList.add("hidden");
        authModal.classList.add("hidden");
        QREngine.stopScanner();
      };
    });

    // 1. SCAN QR Button
    btnScan.onclick = () => {
      SoundFX.playClick();
      setActiveNav(btnScan);
      activeTab = "SCAN";
      
      qrStep1Container.classList.remove("hidden");
      qrStep2Container.classList.add("hidden");
      trashSnapshotPlaceholder.classList.remove("hidden");
      trashSnapshotCanvas.classList.add("hidden");
      currentWasteSnapshotUrl = null;

      qrModal.classList.remove("hidden");
    };

    // Step 1 -> Take Photo Snapshot
    btnTakeTrashPhoto.onclick = () => {
      SoundFX.playClick();
      currentWasteSnapshotUrl = QREngine.takeWasteSnapshot(videoWebcam, trashSnapshotCanvas);

      trashSnapshotPlaceholder.classList.add("hidden");
      trashSnapshotCanvas.classList.remove("hidden");

      proofThumbnailContainer.innerHTML = `<img src="${currentWasteSnapshotUrl}" alt="Bukti Foto">`;

      qrStep1Container.classList.add("hidden");
      qrStep2Container.classList.remove("hidden");

      QREngine.startScanner(videoWebcam, qrScanCanvas, qrStatus, (payload) => {
        QREngine.stopScanner();
        SoundFX.playQrSuccess();

        const parsed = QREngine.parseQrPayload(payload);
        const antiCheat = QREngine.processDailyScanAntiCheat(state, currentWasteSnapshotUrl, parsed.category);

        state.inventory[parsed.itemKey] = (state.inventory[parsed.itemKey] || 0) + 1;
        saveState();

        // If online, upload waste photo proof to Firebase Storage
        if (currentWasteSnapshotUrl && FirebaseManager.getIsOnline()) {
          const logEntry = antiCheat.logEntry;
          FirebaseManager.uploadScanProof(logEntry.id, currentWasteSnapshotUrl, (cloudPhotoUrl) => {
            if (cloudPhotoUrl) {
              logEntry.photo = cloudPhotoUrl;
              saveState();
            }
          });
        }

        alert(`✅ FOTO BUKTI & QR TONG SAMPAH DIVERIFIKASI!\n\nItem Diterima: ${parsed.name}\nStatus Scan: ${antiCheat.tierText}\nBukti foto fisik telah tersimpan ke Cloud / Admin.`);

        qrModal.classList.add("hidden");
        showNotification(`🍖 MENDAPATKAN ${parsed.name.toUpperCase()}!`);
        updateSpeechBubble(`Hore! Bukti foto & QR berhasil diverifikasi! Dapat 1x ${parsed.name}. Berikan ke monstermu!`);
      });
    };

    // Step 2 -> Retake Photo
    btnRetakePhoto.onclick = () => {
      SoundFX.playClick();
      QREngine.stopScanner();
      qrStep2Container.classList.add("hidden");
      qrStep1Container.classList.remove("hidden");
    };

    // 2. FEED Button
    btnFeed.onclick = () => {
      SoundFX.playClick();
      setActiveNav(btnFeed);
      activeTab = "FEED";
      renderFeedInventory();
      feedModal.classList.remove("hidden");
    };

    // 3. HUNT Button
    btnHunt.onclick = () => {
      SoundFX.playClick();
      setActiveNav(btnHunt);
      activeTab = "HUNT";
      if (!wildMonster) {
        spawnWildMonster();
      }
    };

    // 4. ECO-DEX Button
    btnDex.onclick = () => {
      SoundFX.playClick();
      setActiveNav(btnDex);
      activeTab = "DEX";
      renderEcoDex();
      dexModal.classList.remove("hidden");
    };

    // 5. RANK Button
    btnRank.onclick = () => {
      SoundFX.playClick();
      setActiveNav(btnRank);
      activeTab = "RANK";
      renderLeaderboard();
      rankModal.classList.remove("hidden");
    };
  }

  // ==========================================================================
  // 10. INITIALIZATION
  // ==========================================================================
  function initApp() {
    loadState();
    initCamera();
    resizeCanvas();
    setupNavigation();
    setupAdminPanel();
    startHungerInterval();
    startARHuntingSpawns();
    runIntroBootSequence();
    updateHUD();
    updateSpeechBubble();

    // Initialize Firebase Manager & Realtime Cloud Listeners
    FirebaseManager.init(null, (isOnline) => {
      if (isOnline) {
        FirebaseManager.syncStateToCloud(state);
        FirebaseManager.listenRealtimeCloudSync(state, (topic) => {
          if (topic === "leaderboard") renderLeaderboard();
        });
      }
    });

    requestAnimationFrame(gameLoop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }

})();
