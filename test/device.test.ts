import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RAM_HEADROOM_GB, deviceFromStats, engineCap, engineMin, fitProblem, maxSecondsOn, modeMaxSeconds, type Device } from "../lib/device.ts";
import { ENGINES, MAX_CLIP_SECONDS, MAX_OBJECT_SECONDS, OBJECT_WINDOW_SECONDS, PEOPLE_ENGINES, type EngineId } from "../lib/engines.ts";

const ALL = Object.keys(ENGINES) as EngineId[];
// a 24 GB card with 32 GB of RAM, in the shape ComfyUI 0.34 reports it
const STATS = {
  system: { os: "linux", ram_total: 34359738368, ram_free: 20000000000 },
  devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync", type: "cuda", vram_total: 25757220864 }],
};

test("the device comes from ComfyUI's system stats", () => {
  assert.deepEqual(deviceFromStats(STATS), { ramGB: 32, vramGB: 24, gpu: "NVIDIA GeForce RTX 4090" });
  assert.equal(deviceFromStats(null), null);
  assert.equal(deviceFromStats({ system: { ram_total: 1 } }), null);
  assert.equal(deviceFromStats({ system: {}, devices: [{ vram_total: 1 }] }), null);
});

test("without a device the fixed caps apply; an object clip goes to the clip cap in windows", () => {
  for (const id of ALL) assert.equal(maxSecondsOn(id, null), MAX_CLIP_SECONDS);
  assert.equal(engineCap("object"), MAX_OBJECT_SECONDS); // one object job
  assert.equal(engineCap("fun"), MAX_CLIP_SECONDS);
});

test("a big machine gets the caps, never more", () => {
  const big: Device = { ramGB: 1024, vramGB: 96, gpu: "big" };
  for (const id of ALL) assert.equal(maxSecondsOn(id, big), MAX_CLIP_SECONDS);
});

test("less RAM never allows a longer clip", () => {
  for (const id of ALL) {
    let last = Infinity;
    for (const ramGB of [128, 96, 64, 48, 32, 24, 16, 8]) {
      const seconds = maxSecondsOn(id, { ramGB, vramGB: 32, gpu: "x" });
      assert.ok(seconds <= last && seconds >= 0, `${id} at ${ramGB} GB`);
      last = seconds;
    }
  }
});

test("each engine's limit follows its measured RAM need", () => {
  for (const id of PEOPLE_ENGINES) {
    const { ramGB, ramPerSecondGB, minVramGB } = ENGINES[id].memory;
    assert.ok(ramPerSecondGB > 0 && ramGB >= 0 && minVramGB >= 0, id);
    // exactly enough RAM for 3 s (plus the headroom) gives 3 s
    const device = { ramGB: RAM_HEADROOM_GB + ramGB + 3 * ramPerSecondGB + 0.01, vramGB: 96, gpu: "x" };
    assert.equal(maxSecondsOn(id, device), 3, id);
  }
  // an object needs the RAM of one 5 s window, then takes any length up to the cap
  const { ramGB, ramPerSecondGB } = ENGINES.object.memory;
  const window = RAM_HEADROOM_GB + ramGB + OBJECT_WINDOW_SECONDS * ramPerSecondGB;
  assert.equal(maxSecondsOn("object", { ramGB: window + 0.01, vramGB: 96, gpu: "x" }), MAX_CLIP_SECONDS);
  assert.equal(maxSecondsOn("object", { ramGB: window - 0.1, vramGB: 96, gpu: "x" }), 0);
  assert.equal(engineMin("object"), 1);
});

test("a GPU below the smallest tested one runs nothing, with a reason", () => {
  for (const id of ALL) {
    const { minVramGB } = ENGINES[id].memory;
    if (minVramGB === 0) continue;
    const small: Device = { ramGB: 256, vramGB: minVramGB - 1, gpu: "small" };
    assert.equal(maxSecondsOn(id, small), 0);
    assert.match(fitProblem(id, small, 1) ?? "", /needs a GPU with at least/);
  }
});

test("on a GPU under 24 GB an object needs more RAM, the people engines the same", () => {
  const big: Device = { ramGB: 32, vramGB: 24, gpu: "24 GB" };
  const small: Device = { ramGB: 32, vramGB: 16, gpu: "16 GB" };
  assert.equal(maxSecondsOn("object", big), MAX_CLIP_SECONDS);
  assert.equal(maxSecondsOn("object", small), 0); // room for 3 s only, and every window is 5 s
  assert.match(fitProblem("object", small, 5) ?? "", /needs more than the 32 GB of RAM/);
  assert.equal(maxSecondsOn("object", { ...small, ramGB: 48 }), MAX_CLIP_SECONDS);
  for (const id of ["viggle", "fun", "detail", "scail2"] as const) assert.equal(maxSecondsOn(id, small), maxSecondsOn(id, big), id);
});

test("one length per mode from the machine: every people choice takes it", () => {
  for (const ramGB of [16, 24, 32, 48, 64, 128]) {
    for (const vramGB of [16, 24, 32]) {
      const device: Device = { ramGB, vramGB, gpu: "x" };
      const max = modeMaxSeconds(false, device);
      assert.equal(max, Math.min(...PEOPLE_ENGINES.map((id) => maxSecondsOn(id, device))));
      if (max) for (const id of PEOPLE_ENGINES) assert.equal(fitProblem(id, device, max), null, `${id} at ${ramGB} GB`);
    }
  }
  assert.equal(modeMaxSeconds(false, { ramGB: 32, vramGB: 24, gpu: "x" }), 15);
  assert.equal(modeMaxSeconds(false, null), MAX_CLIP_SECONDS);
  assert.equal(modeMaxSeconds(true, null), MAX_CLIP_SECONDS);
});

test("an object clip of any length from 1 s fits a machine that fits one window", () => {
  for (const device of [null, { ramGB: 64, vramGB: 32, gpu: "x" }]) {
    for (const seconds of [1, 3, 5, 6, 20, MAX_CLIP_SECONDS]) assert.equal(fitProblem("object", device, seconds), null, `${seconds} s`);
  }
  assert.equal(fitProblem("fun", null, 3), null);
});

test("a clip within the limit has no problem; a longer one says how long fits", () => {
  const device = { ramGB: RAM_HEADROOM_GB + ENGINES.fun.memory.ramGB + 4 * ENGINES.fun.memory.ramPerSecondGB + 0.01, vramGB: 96, gpu: "x" };
  assert.equal(fitProblem("fun", device, 4), null);
  assert.match(fitProblem("fun", device, 6) ?? "", /Fast takes up to 4 s on this machine/);
});
