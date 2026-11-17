import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchableByGateway, isJpeg, shrink } from "./assistant-images.ts";

function solid(width: number, height: number, rgba: number[]) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = rgba[index % 4] ?? 0;
  }
  return { data, height, width };
}

void test("a small image comes back as it is", () => {
  const image = solid(10, 20, [1, 2, 3, 255]);
  assert.equal(shrink(image, 1568), image);
});

void test("the longer side is scaled to the limit, keeping the shape", () => {
  const shrunk = shrink(solid(4284, 5712, [0, 0, 0, 255]), 1568);
  assert.equal(shrunk.height, 1568);
  assert.equal(shrunk.width, 1176);
  assert.equal(shrunk.data.length, 1176 * 1568 * 4);
});

void test("each pixel is the average of the ones it covers", () => {
  // Two columns, black and white, become one grey pixel.
  const image = {
    data: new Uint8Array([0, 0, 0, 255, 200, 100, 50, 255]),
    height: 1,
    width: 2,
  };
  assert.deepEqual([...shrink(image, 1).data], [100, 50, 25, 255]);
});

void test("HEIC isn't fetched by the gateway; the common formats are", () => {
  assert.equal(fetchableByGateway("image/heic"), false);
  assert.equal(fetchableByGateway("IMAGE/JPEG"), true);
  assert.equal(fetchableByGateway("image/gif"), true);
});

void test("a JPEG is known by its bytes, not its type", () => {
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1])), true);
  // The start of an iPhone HEIC: a box size, then "ftypheic".
  const heic = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
  assert.equal(isJpeg(heic), false);
  assert.equal(isJpeg(new Uint8Array()), false);
});
