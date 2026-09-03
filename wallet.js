/**
 * Eco-Gotchi: WebAR Tamagotchi Daur Ulang
 * Fase 3: Eco-Token Wallet & Local Storage Controller
 */

const STORAGE_KEY = 'ECOGOTCHI_WALLET_DATA_V1';

const DEFAULT_WALLET_DATA = {
  balance: 50, // Bonus awal pemain baru
  totalEarned: 50,
  totalSpent: 0,
  transactions: [
    {
      id: 'tx_init',
      type: 'EARN',
      amount: 50,
      description: '🌱 Bonus Selamat Datang Eco-Gotchi',
      timestamp: new Date().toISOString()
    }
  ]
};

const WalletManager = {
  data: null,
  listeners: [],

  /**
   * Inisialisasi data dompet dari LocalStorage
   */
  init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.data = JSON.parse(saved);
      } else {
        this.data = JSON.parse(JSON.stringify(DEFAULT_WALLET_DATA));
        this.save();
      }
    } catch (e) {
      console.error('[WalletManager] Gagal memuat data dari localStorage:', e);
      this.data = JSON.parse(JSON.stringify(DEFAULT_WALLET_DATA));
    }
    console.log('[WalletManager] Dompet aktif. Saldo saat ini:', this.data.balance, 'Eco-Tokens');
    this.notify();
  },

  /**
   * Simpan perubahan ke LocalStorage
   */
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this.notify();
    } catch (e) {
      console.error('[WalletManager] Gagal menyimpan ke localStorage:', e);
    }
  },

  /**
   * Dapatkan saldo saat ini
   */
  getBalance() {
    return this.data ? this.data.balance : 0;
  },

  /**
   * Dapatkan ringkasan statistik dompet
   */
  getSummary() {
    return {
      balance: this.data.balance,
      totalEarned: this.data.totalEarned,
      totalSpent: this.data.totalSpent,
      txCount: this.data.transactions.length
    };
  },

  /**
   * Dapatkan riwayat transaksi
   */
  getTransactions() {
    return this.data ? [...this.data.transactions].reverse() : [];
  },

  /**
   * Tambah Eco-Token (misal dari pemindaian QR sampah)
   */
  addTokens(amount, description = 'Imbalan Daur Ulang Sampah') {
    if (amount <= 0) return false;
    
    this.data.balance += amount;
    this.data.totalEarned += amount;
    
    this.data.transactions.push({
      id: 'tx_' + Date.now(),
      type: 'EARN',
      amount: amount,
      description: description,
      timestamp: new Date().toISOString()
    });

    this.save();
    return true;
  },

  /**
   * Belanjakan Eco-Token (misal untuk makanan/perawatan monster di Fase 5)
   */
  spendTokens(amount, description = 'Membeli Makanan Monster') {
    if (amount <= 0) return false;
    if (this.data.balance < amount) {
      return false; // Saldo tidak mencukupi
    }

    this.data.balance -= amount;
    this.data.totalSpent += amount;

    this.data.transactions.push({
      id: 'tx_' + Date.now(),
      type: 'SPEND',
      amount: amount,
      description: description,
      timestamp: new Date().toISOString()
    });

    this.save();
    return true;
  },

  /**
   * Daftarkan listener untuk update UI otomatis saat saldo berubah
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
      // Panggil segera dengan data saat ini
      callback(this.getBalance(), this.getTransactions());
    }
  },

  /**
   * Pemicu notifikasi ke semua listener
   */
  notify() {
    const bal = this.getBalance();
    const txs = this.getTransactions();
    this.listeners.forEach((cb) => {
      try {
        cb(bal, txs);
      } catch (err) {
        console.error('[WalletManager] Error pada listener callback:', err);
      }
    });
  }
};

window.WalletManager = WalletManager;
