# Panduan Pemasangan Web App Inventaris Gudang

## Langkah 1: Siapkan Google Spreadsheet
1. Buka [Google Drive](https://drive.google.com).
2. Buat Spreadsheet baru, beri nama: `Database Inventaris Gudang`.
3. Di menu atas, klik **Ekstensi (Extensions)** > **Apps Script**.

---

## Langkah 2: Masukkan Kode
Di editor Google Apps Script:
1. Buka file `Code.gs`, hapus kode bawaan yang kosong, lalu **Copy & Paste** seluruh isi file [`Code.gs`](file:///F:/inventaris%20barang/Code.gs).
2. Klik tombol **+** di sebelah kiri (Files) > Pilih **HTML**.
3. Beri nama file: `Index` (akan menjadi `Index.html`).
4. Hapus isi bawaan, lalu **Copy & Paste** seluruh isi file [`Index.html`](file:///F:/inventaris%20barang/Index.html).
5. Klik ikon **Save** (💾) untuk menyimpan proyek.

---

## Langkah 3: Inisialisasi Database & Folder Drive (Hanya 1 Kali)
1. Pada dropdown fungsi di toolbar atas editor Apps Script, pilih fungsi **`setupDatabaseAndFolders`**.
2. Klik tombol **Run (Jalankan)**.
3. Google akan meminta izin (*Authorization Required*):
   - Klik **Review Permissions** (Tinjau Izin).
   - Pilih akun Google Anda.
   - Klik **Advanced (Lanjutan)** > klik **Go to Untitled project (unsafe)** / Lanjutkan.
   - Klik **Allow (Izinkan)**.
4. Selesai! Buka tab Spreadsheet Anda, header tabel sudah otomatis terbentuk. Di Google Drive Anda juga sudah terbentuk folder `INVENTARIS GUDANG` beserta 4 subfolder lokasinya.

---

## Langkah 4: Publikasikan (Deploy) Web App
1. Di pojok kanan atas Apps Script, klik **Deploy** > **New deployment**.
2. Klik ikon gerigi (Select type) > pilih **Web app**.
3. Isi konfigurasi:
   - **Description**: `Inventaris Gudang v1`
   - **Execute as**: `Me (email@gmail.com)`
   - **Who has access**: `Anyone` (atau `Anyone with Google account`)
4. Klik tombol **Deploy**.
5. Salin URL **Web app URL** yang muncul (misal: `https://script.google.com/macros/s/.../exec`).

---

## Langkah 5: Cara Penggunaan di Lapangan (HP / PC)
- Buka URL Web App di browser HP (Chrome / Safari).
- (Opsional) Di HP, tekan menu browser (titik 3) > pilih **Add to Home screen** (Tambahkan ke layar utama) agar tampil seperti aplikasi resmi.
- Isi Form:
  - **Nama Barang**: Ketik nama barang.
  - **Merk / Type**: Opsional.
  - **Lokasi**: Pilih dari dropdown (Ruang telnav, Gudang recorder, Gudang safety, Gudang NDB).
  - **Kondisi**: Pilih `Baik`, `Rusak`, atau `(-)`.
  - **Foto**: Klik kotak kamera, bisa ambil foto langsung dari kamera HP atau pilih dari galeri (bisa lebih dari 1).
  - Klik **Simpan Data Barang**.
- Foto langsung otomatis terkompres dan tersimpan di subfolder Drive lokasi terkait.
- Baris data & link foto langsung masuk ke Google Sheet secara rapi!
