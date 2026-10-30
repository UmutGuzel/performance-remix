import { strict as assert } from "node:assert";
import { test } from "node:test";
import { imageSize } from "../lib/image-size.ts";

function bytes(...parts: (number[] | string | Uint8Array)[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : [...part])));
}

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

test("PNG size comes from the IHDR chunk", () => {
  const png = bytes([0x89], "PNG", [13, 10, 26, 10], u32be(13), "IHDR", u32be(1080), u32be(1920), [8, 6, 0, 0, 0]);
  assert.deepEqual(imageSize(png), { width: 1080, height: 1920 });
});

test("JPEG size comes from the start-of-frame segment, after other segments and fill bytes", () => {
  const app0 = [0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46];
  const dht = [0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]; // Huffman table: not a frame, must be skipped
  const sof0 = [0xff, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03];
  assert.deepEqual(imageSize(bytes([0xff, 0xd8], app0, dht, sof0, new Array(12).fill(0))), { width: 1920, height: 1080 });
});

test("WebP sizes for the extended, lossy and lossless formats", () => {
  const head = (chunk: string) => bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk);
  const vp8x = bytes(head("VP8X"), [10, 0, 0, 0, 0, 0, 0, 0], [0x7f, 0x07, 0x00], [0x37, 0x04, 0x00]);
  assert.deepEqual(imageSize(vp8x), { width: 1920, height: 1080 });
  const vp8 = bytes(head("VP8 "), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0x80, 0x07], [0x38, 0x04]);
  assert.deepEqual(imageSize(vp8), { width: 1920, height: 1080 });
  // lossless: 14-bit width - 1 and height - 1 packed after the 0x2f signature byte
  const bits = (1919 & 0x3fff) | ((1079 & 0x3fff) << 14);
  const vp8l = bytes(head("VP8L"), [0, 0, 0, 0, 0x2f], [bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255], [0, 0, 0, 0, 0]);
  assert.deepEqual(imageSize(vp8l), { width: 1920, height: 1080 });
});

test("anything else has no size", () => {
  assert.equal(imageSize(bytes("GIF89a", new Array(30).fill(0))), null);
  assert.equal(imageSize(new Uint8Array(0)), null);
});
