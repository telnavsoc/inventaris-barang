/**
 * INVENTARIS GUDANG - GOOGLE APPS SCRIPT
 * Database: Google Sheets (Data Inventaris & Riwayat Mutasi)
 * Storage: Google Drive (Folder per Lokasi)
 */

const CONFIG = {
  SHEET_NAME: 'Data Inventaris',
  MUTASI_SHEET_NAME: 'Riwayat Mutasi',
  ROOT_FOLDER_NAME: 'INVENTARIS GUDANG',
  LOCATIONS: [
    'Ruang telnav',
    'Gudang recorder',
    'Gudang safety',
    'Gudang NDB'
  ]
};

/**
 * Melayani antarmuka Web App & API GET
 */
function doGet(e) {
  // Jika dipanggil sebagai API JSON
  if (e && e.parameter && e.parameter.action) {
    const action = e.parameter.action;
    let result = { success: false, error: 'Aksi tidak dikenali' };
    try {
      if (action === 'list') {
        result = { success: true, items: getInventoryItems() };
      } else if (action === 'history') {
        result = { success: true, history: getMutationHistory() };
      }
    } catch (err) {
      result = { success: false, error: err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Standar Web App HTML
  var htmlName = 'index';
  try {
    return HtmlService.createHtmlOutputFromFile(htmlName)
      .setTitle('Inventaris Barang Gudang')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Inventaris Barang Gudang')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Menerima POST request (memungkinkan form di-host di luar script.google.com,
 * sehingga bebas dari issue multi-account Google di HP)
 */
function doPost(e) {
  try {
    let payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    } else {
      throw new Error('Data payload kosong.');
    }

    const action = payload.action || 'create';
    let result;

    if (action === 'create') {
      result = submitInventoryItem(payload);
    } else if (action === 'list') {
      result = { success: true, items: getInventoryItems() };
    } else if (action === 'move') {
      result = moveInventoryItem(payload);
    } else if (action === 'updateCondition') {
      result = updateInventoryCondition(payload);
    } else if (action === 'history') {
      result = { success: true, history: getMutationHistory() };
    } else {
      throw new Error('Aksi tidak dikenali: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Inisialisasi awal Google Sheet dan struktur Folder Google Drive.
 * Jalankan fungsi ini SATU KALI di editor Apps Script sebelum deploy.
 */
function setupDatabaseAndFolders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  
  const headers = [
    'Timestamp',
    'ID Barang',
    'Nama Barang',
    'Merk / Type',
    'Lokasi',
    'Kondisi',
    'Jumlah Foto',
    'Link Foto Drive'
  ];
  
  // Format Header Data Inventaris
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1a73e8')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
    
  sheet.setFrozenRows(1);
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }
  
  // Siapkan Sheet Riwayat Mutasi
  setupMutationSheet_(ss);

  // Siapkan Folder Drive
  const rootFolder = getOrCreateFolder_(CONFIG.ROOT_FOLDER_NAME);
  CONFIG.LOCATIONS.forEach(function(loc) {
    getOrCreateSubfolder_(rootFolder, loc);
  });
  
  Logger.log('Inisialisasi selesai! Folder root ID: ' + rootFolder.getId());
  return 'Sukses inisialisasi sheet dan folder Drive!';
}

/**
 * Setup Sheet Riwayat Mutasi
 */
function setupMutationSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.MUTASI_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.MUTASI_SHEET_NAME);
  }
  const headers = ['Timestamp', 'ID Barang', 'Nama Barang', 'Lokasi Asal', 'Lokasi Baru', 'Keterangan'];
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#0d47a1')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }
  return sheet;
}

/**
 * Menerima submission barang dan foto dari Web App
 */
function submitInventoryItem(payload) {
  try {
    if (!payload || !payload.namaBarang || !payload.lokasi || !payload.kondisi) {
      throw new Error('Data wajib belum lengkap (Nama Barang, Lokasi, dan Kondisi harus diisi).');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      setupDatabaseAndFolders();
      sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    }

    const timestamp = new Date();
    const idBarang = generateItemId_(payload.lokasi);

    // Cari atau buat subfolder lokasi
    const rootFolder = getOrCreateFolder_(CONFIG.ROOT_FOLDER_NAME);
    const locationFolder = getOrCreateSubfolder_(rootFolder, payload.lokasi);

    // Simpan foto ke Google Drive
    const photoUrls = [];
    if (payload.photos && payload.photos.length > 0) {
      for (let i = 0; i < payload.photos.length; i++) {
        const p = payload.photos[i];
        const cleanName = payload.namaBarang.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = idBarang + '_' + cleanName + '_' + (i + 1) + '.jpg';
        
        const bytes = Utilities.base64Decode(p.base64);
        const blob = Utilities.newBlob(bytes, p.mimeType || 'image/jpeg', fileName);
        const file = locationFolder.createFile(blob);
        file.setDescription('Inventaris: ' + payload.namaBarang + ' (' + payload.lokasi + ')');
        photoUrls.push(file.getUrl());
      }
    }

    // Format Link Foto untuk Spreadsheet
    let photoLinkFormula = '-';
    if (photoUrls.length === 1) {
      photoLinkFormula = '=HYPERLINK("' + photoUrls[0] + '", "Buka Foto")';
    } else if (photoUrls.length > 1) {
      photoLinkFormula = photoUrls.join('\n');
    }

    // Simpan baris baru ke sheet
    sheet.appendRow([
      timestamp,
      idBarang,
      payload.namaBarang,
      payload.merkType || '-',
      payload.lokasi,
      payload.kondisi,
      photoUrls.length,
      photoLinkFormula
    ]);

    // Format wrap teks kolom link
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1, 1, 8).setVerticalAlignment('middle');
    sheet.getRange(lastRow, 8).setWrap(true);

    return {
      success: true,
      idBarang: idBarang,
      photoCount: photoUrls.length
    };

  } catch (err) {
    Logger.log('Error saat simpan barang: ' + err.toString());
    return {
      success: false,
      error: err.toString()
    };
  }
}

/**
 * Mengambil semua daftar barang dari Sheet
 */
function getInventoryItems() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const items = [];

  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    const rawTimestamp = row[0];
    let formattedDate = '';
    try {
      formattedDate = Utilities.formatDate(new Date(rawTimestamp), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
    } catch(e) {
      formattedDate = String(rawTimestamp || '');
    }

    const rawPhotos = String(row[7] || '');
    const photoUrls = [];
    const urlMatches = rawPhotos.match(/https?:\/\/[^\s",\)]+/g);
    if (urlMatches) {
      photoUrls.push(...urlMatches);
    }

    items.push({
      idBarang: String(row[1] || ''),
      namaBarang: String(row[2] || ''),
      merkType: String(row[3] || '-'),
      lokasi: String(row[4] || ''),
      kondisi: String(row[5] || '(-)'),
      photoCount: Number(row[6] || 0),
      photoUrls: photoUrls,
      timestamp: formattedDate
    });
  }

  return items;
}

/**
 * Pindah Lokasi Barang (Mutasi)
 */
function moveInventoryItem(payload) {
  if (!payload.idBarang || !payload.lokasiBaru) {
    throw new Error('ID Barang dan Lokasi Baru wajib diisi.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Sheet Data Inventaris tidak ditemukan.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Database inventaris masih kosong.');

  const idColValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0]).trim() === String(payload.idBarang).trim()) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error('Barang dengan ID ' + payload.idBarang + ' tidak ditemukan.');
  }

  const namaBarang = sheet.getRange(targetRow, 3).getValue();
  const lokasiAsal = sheet.getRange(targetRow, 5).getValue();
  const lokasiBaru = payload.lokasiBaru;

  // Update kolom Lokasi (Kolom 5)
  sheet.getRange(targetRow, 5).setValue(lokasiBaru);

  // Catat log ke sheet Riwayat Mutasi
  let mutasiSheet = ss.getSheetByName(CONFIG.MUTASI_SHEET_NAME);
  if (!mutasiSheet) {
    mutasiSheet = setupMutationSheet_(ss);
  }

  const now = new Date();
  mutasiSheet.appendRow([
    now,
    payload.idBarang,
    namaBarang,
    lokasiAsal,
    lokasiBaru,
    payload.keterangan || '-'
  ]);

  return {
    success: true,
    idBarang: payload.idBarang,
    namaBarang: namaBarang,
    lokasiAsal: lokasiAsal,
    lokasiBaru: lokasiBaru
  };
}

/**
 * Ubah Kondisi Barang (Baik / Rusak / (-))
 */
function updateInventoryCondition(payload) {
  if (!payload.idBarang || !payload.kondisiBaru) {
    throw new Error('ID Barang dan Kondisi Baru wajib diisi.');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Sheet Data Inventaris tidak ditemukan.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Database inventaris masih kosong.');

  const idColValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0]).trim() === String(payload.idBarang).trim()) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error('Barang dengan ID ' + payload.idBarang + ' tidak ditemukan.');
  }

  // Update kolom Kondisi (Kolom 6)
  sheet.getRange(targetRow, 6).setValue(payload.kondisiBaru);

  return {
    success: true,
    idBarang: payload.idBarang,
    kondisiBaru: payload.kondisiBaru
  };
}

/**
 * Ambil Riwayat Mutasi
 */
function getMutationHistory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.MUTASI_SHEET_NAME);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const history = [];

  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    let formattedDate = '';
    try {
      formattedDate = Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone() || 'Asia/Jakarta', 'dd/MM/yyyy HH:mm');
    } catch(e) {
      formattedDate = String(row[0] || '');
    }

    history.push({
      timestamp: formattedDate,
      idBarang: String(row[1] || ''),
      namaBarang: String(row[2] || ''),
      lokasiAsal: String(row[3] || ''),
      lokasiBaru: String(row[4] || ''),
      keterangan: String(row[5] || '-')
    });
  }

  return history;
}

/**
 * Generate ID unik: INV-[LOKASI]-[YYMMDD-HHmmss]
 */
function generateItemId_(lokasi) {
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyMMdd-HHmmss');
  let code = 'ITM';
  if (lokasi.indexOf('telnav') !== -1) code = 'TEL';
  else if (lokasi.indexOf('recorder') !== -1) code = 'REC';
  else if (lokasi.indexOf('safety') !== -1) code = 'SFT';
  else if (lokasi.indexOf('NDB') !== -1) code = 'NDB';
  return 'INV-' + code + '-' + dateStr;
}

/**
 * Helper: Ambil atau buat folder di root Drive
 */
function getOrCreateFolder_(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

/**
 * Helper: Ambil atau buat subfolder di dalam folder induk
 */
function getOrCreateSubfolder_(parentFolder, subfolderName) {
  const subfolders = parentFolder.getFoldersByName(subfolderName);
  if (subfolders.hasNext()) {
    return subfolders.next();
  }
  return parentFolder.createFolder(subfolderName);
}
