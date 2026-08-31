// ==========================================
// 1. REGISTRASI PWA (Service Worker)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Sistem PWA Aktif!'))
            .catch(err => console.log('PWA Gagal didaftarkan:', err));
    });
}

// ==========================================
// 2. VARIABEL GLOBAL (Menarik Elemen dari HTML)
// ==========================================
const btnStart = document.getElementById('btn-start');
const pixelText = document.getElementById('pixel-text');
const cameraFeed = document.getElementById('camera-feed');
const phaserContainer = document.getElementById('phaser-game'); // Tarik wadah monster

let isRadarActive = false;
let cameraStream = null;

// ==========================================
// 3. MESIN GAME 2D (PHASER.JS)
// ==========================================
const config = {
    type: Phaser.AUTO,
    parent: 'phaser-game',
    width: 300,  
    height: 400, 
    transparent: true, 
    scene: {
        preload: preloadGame, // TAMBAHAN BARU: Memanggil fungsi muat gambar
        create: createGame
    }
};

const game = new Phaser.Game(config);
let dummyMonster;

// ==========================================
// FUNGSI PHASER: VERSI FOTO SENDIRI
// ==========================================
function preloadGame() {
    // Memanggil file monster.png dari folder yang sama
    this.load.image('pet', 'monster.png');
}

function createGame() {
    this.children.removeAll();

    // Spawn foto monster kamu di tengah
    dummyMonster = this.add.image(150, 200, 'pet');
    
    // Sesuaikan skalanya. Kalau fotonya kegedean, kecilin angkanya (misal 0.5)
    // Kalau kekecilan, gedein angkanya (misal 2 atau 3). Coba tes pakai 1 dulu.
    dummyMonster.setScale(1);

    // Animasi napas (tetap kita pasang biar hidup)
    this.tweens.add({
        targets: dummyMonster,
        scaleX: '*=1.1', // Membesar 10% dari skala asli
        scaleY: '*=0.9', // Mengecil 10% dari skala asli
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        duration: 800
    });
}

function createGame() {
    // Membuat Kotak Hijau sebagai monster sementara
    dummyMonster = this.add.rectangle(150, 200, 50, 50, 0x33ff66);
    
    // Memberikan animasi denyut/napas
    this.tweens.add({
        targets: dummyMonster,
        scaleX: 1.2,
        scaleY: 0.8,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        duration: 800
    });
}

// ==========================================
// 4. INTERAKSI TOMBOL (TOGGLE RADAR + MONSTER)
// ==========================================
btnStart.addEventListener('click', () => {
    
    // JIKA RADAR SEDANG MATI -> NYALAKAN
    if (!isRadarActive) {
        isRadarActive = true; 
        
        // 1. Ubah UI
        pixelText.innerHTML = `
            <h2 style="font-size: 14px; margin-bottom: 10px;">RADAR AKTIF</h2>
            <p class="blink" style="color: red;">MENCARI SINYAL...</p>
        `;
        btnStart.innerText = "HENTIKAN RADAR";
        btnStart.style.color = "red";
        btnStart.style.borderColor = "red";
        
        // 2. Munculkan Wadah Monster (Phaser)
        phaserContainer.style.display = "block";
        
        // 3. Nyalakan Kamera
        navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        })
        .then(function(stream) {
            cameraStream = stream; 
            cameraFeed.srcObject = stream;
            cameraFeed.style.display = "block"; 
        })
        .catch(function(err) {
            console.error("Error kamera: ", err);
        });

    } 
    // JIKA RADAR SEDANG NYALA -> MATIKAN
    else {
        isRadarActive = false; 
        
        // 1. Matikan Kamera
        if (cameraStream) {
            let tracks = cameraStream.getTracks();
            tracks.forEach(track => track.stop()); 
            cameraStream = null;
        }
        cameraFeed.style.display = "none";
        cameraFeed.srcObject = null;
        
        // 2. Sembunyikan Wadah Monster (Phaser)
        phaserContainer.style.display = "none";
        
        // 3. Kembalikan UI
        pixelText.innerHTML = `
            <h1>ECO-RANGERS</h1>
            <p class="blink">PRESS START</p>
        `;
        btnStart.innerText = "MULAI BERBURU";
        btnStart.style.color = "#33ff66"; 
        btnStart.style.borderColor = "#33ff66";
    }
});