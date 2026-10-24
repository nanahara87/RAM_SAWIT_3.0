# RAM Sawit 3.0.0 — Offline, Localhost/LAN, dan Server Online

Aplikasi transaksi RAM Sawit dibangun dengan HTML/CSS/JS, server Node.js, dan Electron untuk Windows. Tidak menggunakan Google Apps Script.

## Fitur
- Pembelian TBS, penjualan, pengeluaran, dashboard, laporan/CSV, dan backup JSON.
- Penyimpanan lokal ketika offline; server localhost dan akses LAN ketika aplikasi desktop berjalan.
- Sinkronisasi dengan server Node.js online, autentikasi admin, penggabungan berdasarkan ID dan waktu pembaruan.
- Pengaturan identitas usaha dan **unggah logo** PNG/JPG/WebP; logo disimpan bersama data dan ikut tersinkron.
- Server menyimpan snapshot riwayat perubahan di `history.jsonl`.

## Build installer Windows dari GitHub
1. Unggah seluruh isi folder ini ke branch `main` pada repositori GitHub.
2. Buka tab **Actions** dan jalankan **Build RAM Sawit Windows Installer**.
3. Setelah workflow hijau, buka hasil run dan unduh artifact `RAM-Sawit-Windows-...`; isinya installer `.exe` dan portable `.exe`.
4. Untuk membuat Release, buat tag seperti `v3.0.0` dan push tag itu; workflow akan melampirkan EXE ke GitHub Release.

Build memerlukan internet pada runner GitHub untuk mengambil Electron dan dependensi.

## Jalankan dari sumber
Node.js 22+ disarankan.

```sh
npm install
npm start          # aplikasi desktop Electron
npm run start:server # server web online / LAN
npm test
```

## Server online dengan Render
`render.yaml` menyediakan blueprint dasar. Hubungkan repository ini ke Render dan deploy Blueprint. Pastikan persistent disk terpasang di `/opt/render/project/src/data`; tanpa disk persisten, file database dapat hilang ketika instance diganti. Setelah deploy, gunakan URL HTTPS server pada menu Pengaturan → Server Online. Buat akun administrator pertama dari layar login server.

## Logo
Logo awal berada di `public/assets/logo-default.png`. Pengguna dapat mengubahnya melalui menu **Pengaturan → Identitas usaha dan logo → Unggah logo**. Logo yang dipilih disimpan dalam pengaturan aplikasi dan disinkronkan bersama data server.

## Catatan keamanan dan operasional
- Server online perlu HTTPS dan persistent storage. Jangan gunakan penyimpanan ephemeral untuk data produksi.
- Akses LAN ditujukan untuk jaringan tepercaya; jangan meneruskan port LAN langsung ke internet.
- Cadangkan data secara berkala dari menu aplikasi. Riwayat audit membantu pemulihan, tetapi bukan pengganti backup terpisah.
