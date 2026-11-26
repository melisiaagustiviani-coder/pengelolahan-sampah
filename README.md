# Sistem Manajemen Pengelolaan Sampah — Balunijuk & Pagarawan

Prototipe full-stack untuk pemetaan kontainer resmi, laporan TPS liar, rute pengangkutan, dan alur kerja warga/petugas/admin. Backend dan frontend berjalan sendiri-sendiri di terminal terpisah.

## Prasyarat

- Node.js 18 atau lebih baru dan npm
- MySQL 8.x

Jika PowerShell tidak mengenali `node`/`npm` dari instalasi Laragon, tambahkan direktori Node ke PATH di setiap terminal:

```powershell
$env:Path = "C:\laragon\bin\nodejs\node-v22;$env:Path"
```

## 1. Siapkan database dan backend

1. Jalankan `backend/database.sql` di MySQL Workbench atau klien MySQL. Skrip membuat database `waste_management_balunijuk`, tabel, tiga akun demo, dan data contoh geospasial.
2. Buka terminal di folder `backend`, salin `.env.example` sebagai `.env`, lalu sesuaikan kredensial MySQL.
3. Jalankan:

   ```powershell
   npm install
   npm run dev
   ```

API tersedia di `http://localhost:4000`; pemeriksaan hidup di `http://localhost:4000/api/health`. Foto yang diunggah disimpan di `backend/uploads`.

## 2. Jalankan frontend

Di terminal lain, buka folder `frontend`, salin `.env.example` sebagai `.env` bila URL API berbeda, lalu jalankan:

```powershell
npm install
npm run dev
```

Buka URL Vite yang ditampilkan (default `http://localhost:5173`). Untuk build produksi, jalankan `npm run build`.

## Akun demo

| Role | Nomor telepon |
| --- | --- |
| Warga | `081234567890` |
| Petugas | `081298765432` |
| Admin | `081311223344` |

Login menerima nama dan nomor telepon; akun baru otomatis dibuat sebagai Warga. Warga dan petugas masuk tanpa password, sedangkan Admin wajib mengisi password `majukankebersihan` (dapat diubah melalui `ADMIN_PASSWORD` di `backend/.env`). Ini autentikasi prototipe tanpa password tersimpan per akun, dan tidak untuk deployment produksi.

## Fitur prototipe

- Peta OpenStreetMap berpusat di sekitar Desa Balunijuk, dengan marker kontainer dan laporan, foto bukti, serta polygon rute.
- Warga: memilih titik pada peta, membuat laporan dengan foto, dan melihat riwayat laporan pribadi.
- Petugas: melihat rute tugas, memperbarui status kontainer, memulai penanganan laporan, dan mengirim catatan pembersihan.
- Admin: ringkasan statistik, CRUD kontainer, CRUD pengguna, serta CRUD jadwal/rute dengan polygon yang digambar melalui klik peta.
- Admin dan petugas: riwayat 50 aktivitas terbaru dengan pembaruan otomatis; tabel log dibuat saat backend tersambung ke database.
- Endpoint REST berada di bawah `/api`. Endpoint selain login dan health check memerlukan header `x-user-id` yang dipasang oleh frontend berdasarkan sesi localStorage.

Konfigurasi `.env` hanya untuk pengembangan lokal. Mekanisme login prototipe dan identitas sesi berbasis browser tidak menyediakan autentikasi produksi.
