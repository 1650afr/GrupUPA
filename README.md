# GrupUPA Web v0.1.0

## File
- `index.html`: login dan dashboard
- `app.js`: autentikasi dan pemeriksaan akses awal
- `firebase.js`: konfigurasi Firebase project `grupupa-ad509`
- `style.css`: tampilan responsif

## Sebelum pengujian
1. Pastikan Email/Password aktif di Firebase Authentication.
2. Dokumen `upas/UPA001` harus ada.
3. Dokumen Admin UPA harus berada di `upas/UPA001/anggota/{UID}` dengan `nama` (string), `email` (string), `role` = `admin_upa` (string), dan `aktif` = `true` (boolean).
4. UID Admin Pusat di `app.js` diset ke `5L0w42CRcgVVvqk47dF5vVXOQOV2`.
5. Jalankan melalui HTTPS hosting (Firebase Hosting atau GitHub Pages); jangan membuka `index.html` langsung melalui `file://`.

## Batasan
Ini versi awal untuk uji login dan baca data. Belum ada formulir pengelolaan UPA/anggota/binaan/kegiatan/absensi/Mutabaah, ekspor laporan, atau tautan privat. Isolasi antar-UPA belum terbukti sebelum dites dengan akun UPA kedua. Jangan melonggarkan Security Rules hanya untuk menghilangkan error.
