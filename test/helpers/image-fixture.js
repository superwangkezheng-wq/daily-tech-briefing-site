const zlib = require("node:zlib");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createValidPng(variant = 0, ancillaryBytes = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const red = variant % 2 === 0 ? 53 : 181;
  const green = variant % 2 === 0 ? 103 : 95;
  const blue = variant % 2 === 0 ? 91 : 57;
  const pixels = zlib.deflateSync(Buffer.from([0, red, green, blue, 255]));
  const chunks = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
  ];
  if (ancillaryBytes > 0) chunks.push(pngChunk("ruSt", Buffer.alloc(ancillaryBytes, variant % 2 ? 0x42 : 0x41)));
  chunks.push(pngChunk("IDAT", pixels), pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function createLargeOneBitPng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1;
  ihdr[9] = 0;
  const rowBytes = Math.ceil(width / 8);
  const pixels = zlib.deflateSync(Buffer.alloc((rowBytes + 1) * height));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", pixels),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { createValidPng, createLargeOneBitPng };
