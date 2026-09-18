/**
 * INVENTARIS GUDANG - GOOGLE APPS SCRIPT
 * Database: Google Sheets
 * Storage: Google Drive (Folder per Lokasi)
 */

const CONFIG = {
  SHEET_NAME: 'Data Inventaris',
  ROOT_FOLDER_NAME: 'INVENTARIS GUDANG',
  LOCATIONS: [
    'Ruang telnav',
    'Gudang recorder',
    'Gudang safety',
    'Gudang NDB'
  ]
};

/**
 * Buat GOOGLE FORM RESMI (forms.google.com).
 * 100% native Google, bisa dibuka di SEMUA HP normal tanpa Incognito.
 */
function createOfficialGoogleForm() {
  const form = FormApp.create('Inventaris Gudang');
  form.setDescription('Formulir Inventarisasi Barang Gudang');
  
  // 1. Nama Barang
  form.addTextItem().setTitle('Nama Barang').setRequired(true);
  
  // 2. Merk / Type
  form.addTextItem().setTitle('Merk / Type (Opsional)').setRequired(false);
  
  // 3. Lokasi
  form.addListItem()
    .setTitle('Lokasi')
    .setChoiceValues(CONFIG.LOCATIONS)
    .setRequired(true);
    
  // 4. Kondisi
  form.addMultipleChoiceItem()
    .setTitle('Kondisi')
    .setChoiceValues(['Baik', 'Rusak', '(-)'])
    .setRequired(true);

  // Link respon langsung ke Spreadsheet aktif
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  const editUrl = form.getEditUrl();
  const publishedUrl = form.getPublishedUrl();
  
  Logger.log('LINK EDIT FORM: ' + editUrl);
  Logger.log('LINK FORM HP: ' + publishedUrl);
  return publishedUrl;
}

/**
 * Melayani antarmuka Web App
 */
function doGet(e) {
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

    const result = submitInventoryItem(payload);
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
  
  // Format Header
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
  
  // Siapkan Folder Drive
  const rootFolder = getOrCreateFolder_(CONFIG.ROOT_FOLDER_NAME);
  CONFIG.LOCATIONS.forEach(function(loc) {
    getOrCreateSubfolder_(rootFolder, loc);
  });
  
  Logger.log('Inisialisasi selesai! Folder root ID: ' + rootFolder.getId());
  return 'Sukses inisialisasi sheet dan folder Drive!';
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
