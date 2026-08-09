const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { createZip, readZipEntries } = require("../src/ooxml");

function createDeflatedLocalEntry(name, value, declaredSize = value.length) {
  const nameBuffer = Buffer.from(name);
  const compressed = zlib.deflateRawSync(value);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(declaredSize, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  return Buffer.concat([header, nameBuffer, compressed]);
}

test("rejects oversized stored ZIP entries", () => {
  const zip = createZip([["word/document.xml", Buffer.alloc(128, 65)]]);
  assert.throws(() => readZipEntries(zip, { maxEntryBytes: 64 }), /exceeds 64 bytes/);
});

test("bounds deflate output even when the ZIP header lies about its size", () => {
  const zip = createDeflatedLocalEntry("word/document.xml", Buffer.alloc(4096, 65), 1);
  assert.throws(() => readZipEntries(zip, { maxEntryBytes: 128 }), /Cannot create a Buffer larger|larger than 128|exceeds 128|output length/i);
});

test("rejects truncated headers, too many entries, and excessive archive totals", () => {
  const truncated = Buffer.alloc(10);
  truncated.writeUInt32LE(0x04034b50, 0);
  assert.throws(() => readZipEntries(truncated), /invalid zip local header/i);

  const entries = createZip([["one.xml", Buffer.alloc(60)], ["two.xml", Buffer.alloc(60)]]);
  assert.throws(() => readZipEntries(entries, { maxEntryBytes: 100, maxEntries: 1 }), /exceeds 1 entries/i);
  assert.throws(() => readZipEntries(entries, { maxEntryBytes: 100, maxTotalBytes: 100 }), /exceeds 100 total bytes/i);
});

test("rejects encrypted entries and CRC mismatches", () => {
  const encrypted = createZip([["word/document.xml", Buffer.from("safe")]]);
  encrypted.writeUInt16LE(encrypted.readUInt16LE(6) | 0x0001, 6);
  assert.throws(() => readZipEntries(encrypted), /encrypted/i);

  const corrupted = createZip([["word/document.xml", Buffer.from("safe")]]);
  corrupted[30 + Buffer.byteLength("word/document.xml")] ^= 0xff;
  assert.throws(() => readZipEntries(corrupted), /CRC|checksum/i);
});
