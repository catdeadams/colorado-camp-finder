// Generates the PWA app icons (public/icon-192.png, icon-512.png) with no
// image-library dependency: draws a green tent on the dark brand background,
// supersampled 4x for smooth edges, and encodes PNG bytes directly.
//   node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  const stride = size * 4 + 1
  const raw = Buffer.alloc(size * stride)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function render(size) {
  const S = size * 4 // supersample
  const buf = Buffer.alloc(S * S * 4)
  const bg = [28, 25, 23], green = [34, 197, 94], door = [12, 10, 9]
  const set = (x, y, c) => { const i = (y * S + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255 }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, bg)
  const cx = S / 2, apexY = S * 0.26, baseY = S * 0.70, hw = S * 0.27
  // tent body
  for (let y = Math.floor(apexY); y <= Math.ceil(baseY); y++) {
    const t = (y - apexY) / (baseY - apexY), half = hw * t
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) set(x, y, green)
  }
  // ground stroke
  for (let y = Math.round(baseY); y <= Math.round(baseY + S * 0.02); y++)
    for (let x = Math.round(cx - hw * 1.05); x <= Math.round(cx + hw * 1.05); x++) set(x, y, green)
  // door
  const dApex = S * 0.47, dHw = S * 0.08
  for (let y = Math.floor(dApex); y <= Math.ceil(baseY); y++) {
    const t = (y - dApex) / (baseY - dApex), half = dHw * t
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) set(x, y, door)
  }
  // downsample 4x -> size (box filter)
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const i = ((y * 4 + dy) * S + (x * 4 + dx)) * 4; r += buf[i]; g += buf[i + 1]; b += buf[i + 2] }
    const o = (y * size + x) * 4; out[o] = Math.round(r / 16); out[o + 1] = Math.round(g / 16); out[o + 2] = Math.round(b / 16); out[o + 3] = 255
  }
  return out
}

for (const size of [192, 512]) {
  const png = encodePNG(size, render(size))
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png)
  console.log(`wrote public/icon-${size}.png (${png.length} bytes)`)
}
