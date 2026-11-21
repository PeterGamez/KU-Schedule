import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// โฟลเดอร์ Root ของโปรเจกต์
const ROOT_DIR = path.resolve(import.meta.dir, "..");

// ==========================================
// กำหนดรายการไฟล์และโฟลเดอร์ที่ต้องการนำมา Pack
// ==========================================
const ENTRIES_TO_PACK = [
  "manifest.json",
  "background.js",
  "schedule.html",
  "schedule.js",
  "styles.css",
  "i18n.js",
  "icons",
  "js",
  "lib",
];

// รวบรวมไฟล์ทั้งหมดจากโฟลเดอร์ย่อย
function collectDir(dir, baseDir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name === "Thumbs.db") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      result.push({
        fullPath,
        relPath,
        data: fs.readFileSync(fullPath),
      });
    }
  }

  return result;
}

// ค้นหาไฟล์ตามรายการที่เลือกไว้
function collectSelectedEntries(entryList, baseDir = ROOT_DIR) {
  const result = [];

  for (const entryName of entryList) {
    const fullPath = path.join(baseDir, entryName);

    if (!fs.existsSync(fullPath)) {
      console.warn(`  ⚠️  ไม่พบ "${entryName}" (ข้ามรายการนี้)`);
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (stat.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      result.push({
        fullPath,
        relPath,
        data: fs.readFileSync(fullPath),
      });
    } else if (stat.isDirectory()) {
      result.push(...collectDir(fullPath, baseDir));
    }
  }

  return result;
}

// สร้างไฟล์ Zip มาตรฐาน (PKZIP 2.0 / RFC 1951) โดยไม่พึ่งไลบรารีภายนอก
function createZipBuffer(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const file of files) {
    const nameBuf = Buffer.from(file.relPath, "utf8");
    const uncompressed = file.data;
    const compressed = zlib.deflateRawSync(uncompressed, { level: 9 });
    const crc = zlib.crc32(uncompressed);

    const isDeflated = compressed.length < uncompressed.length;
    const compMethod = isDeflated ? 8 : 0;
    const compData = isDeflated ? compressed : uncompressed;

    // Local file header (30 bytes + nameBuf.length)
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // Signature
    lh.writeUInt16LE(20, 4);         // Version needed (2.0)
    lh.writeUInt16LE(0x0800, 6);     // Flag: UTF-8 filename
    lh.writeUInt16LE(compMethod, 8); // Compression method (8 = Deflate, 0 = Store)
    lh.writeUInt16LE(dosTime, 10);
    lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compData.length, 18);
    lh.writeUInt32LE(uncompressed.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    nameBuf.copy(lh, 30);
    localHeaders.push(lh, compData);

    // Central directory header (46 bytes + nameBuf.length)
    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0); // Signature
    ch.writeUInt16LE(20, 4);         // Version made by
    ch.writeUInt16LE(20, 6);         // Version needed
    ch.writeUInt16LE(0x0800, 8);     // Flag: UTF-8
    ch.writeUInt16LE(compMethod, 10);// Compression method
    ch.writeUInt16LE(dosTime, 12);   // Time
    ch.writeUInt16LE(dosDate, 14);   // Date
    ch.writeUInt32LE(crc, 16);       // CRC32
    ch.writeUInt32LE(compData.length, 20);
    ch.writeUInt32LE(uncompressed.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);         // Extra length
    ch.writeUInt16LE(0, 32);         // Comment length
    ch.writeUInt16LE(0, 34);         // Disk start
    ch.writeUInt16LE(0, 36);         // Internal attrs
    ch.writeUInt32LE(0, 38);         // External attrs
    ch.writeUInt32LE(offset, 42);    // Local header offset
    nameBuf.copy(ch, 46);
    centralHeaders.push(ch);

    offset += lh.length + compData.length;
  }

  const cdBuffer = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // Signature
  eocd.writeUInt16LE(0, 4);                // Disk number
  eocd.writeUInt16LE(0, 6);                // Start disk
  eocd.writeUInt16LE(files.length, 8);     // Entries on this disk
  eocd.writeUInt16LE(files.length, 10);    // Total entries
  eocd.writeUInt32LE(cdBuffer.length, 12); // Central dir size
  eocd.writeUInt32LE(offset, 16);          // Central dir offset
  eocd.writeUInt16LE(0, 20);               // Comment length

  return Buffer.concat([...localHeaders, cdBuffer, eocd]);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// เริ่มต้นกระบวนการ Packaging
function main() {
  const manifestPath = path.join(ROOT_DIR, "manifest.json");
  let version = "unknown";
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      version = manifest.version || version;
    } catch (e) { }
  }

  const outputFileName = `KU_Schedule_v${version}.zip`;
  const outputPath = path.join(ROOT_DIR, outputFileName);

  console.log(`📦 Packaging KU Schedule (v${version}) with Bun...`);
  console.log(`📋 รายการเป้าหมาย: [${ENTRIES_TO_PACK.join(", ")}]\n`);

  const files = collectSelectedEntries(ENTRIES_TO_PACK, ROOT_DIR);
  if (files.length === 0) {
    console.error("❌ ไม่พบไฟล์สำหรับแพ็กเกจ");
    process.exit(1);
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));

  for (const f of files) {
    console.log(`  ✓ ${f.relPath} (${formatBytes(f.data.length)})`);
  }

  const zipBuffer = createZipBuffer(files);
  fs.writeFileSync(outputPath, zipBuffer);

  console.log(`\n🎉 แพ็กเกจสำเร็จ!`);
  console.log(`  📁 ไฟล์ผลลัพธ์: ${outputFileName}`);
  console.log(`  📊 ขนาดไฟล์: ${formatBytes(zipBuffer.length)} (${zipBuffer.length} bytes)`);
  console.log(`  📄 รวมทั้งหมด: ${files.length} ไฟล์\n`);
}

main();
