const zlib = require("node:zlib");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const [name, value] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }

  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuffer, end]);
}

function readZipEntries(buffer, options = {}) {
  const maxEntryBytes = options.maxEntryBytes ?? 16 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 32 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 128;
  const entries = new Map();
  let offset = 0;
  let totalBytes = 0;
  while (offset + 4 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    if (offset + 30 > buffer.length) throw new Error("Invalid ZIP local header");
    if (entries.size >= maxEntries) throw new Error(`ZIP archive exceeds ${maxEntries} entries`);
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    if (flags & 0x0008) throw new Error("DOCX data descriptors are not supported");
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error("Invalid ZIP entry length");
    if (uncompressedSize > maxEntryBytes) throw new Error(`ZIP entry exceeds ${maxEntryBytes} bytes`);
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (entries.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    const compressed = buffer.subarray(dataStart, dataEnd);
    let inflated;
    if (method === 0) {
      if (compressed.length > maxEntryBytes) throw new Error(`ZIP entry exceeds ${maxEntryBytes} bytes`);
      inflated = Buffer.from(compressed);
    } else if (method === 8) {
      inflated = zlib.inflateRawSync(compressed, { maxOutputLength: maxEntryBytes });
      if (inflated.length > maxEntryBytes) throw new Error(`ZIP entry exceeds ${maxEntryBytes} bytes`);
    } else throw new Error(`Unsupported ZIP compression method: ${method}`);
    if (inflated.length !== uncompressedSize) throw new Error(`ZIP entry size mismatch: ${name}`);
    totalBytes += inflated.length;
    if (totalBytes > maxTotalBytes) throw new Error(`ZIP archive exceeds ${maxTotalBytes} total bytes`);
    entries.set(name, inflated);
    offset = dataEnd;
  }
  return entries;
}

module.exports = { createZip, readZipEntries };
