// The machine ComfyUI runs on, read from its /system_stats, and how long a clip each engine can take there. Pure
// functions shared by the routes, the UI and the tests; the fetch itself is in lib/device-stats.ts.
import { ENGINES, MAX_CLIP_SECONDS, MAX_OBJECT_SECONDS, MIN_OBJECT_SECONDS, OBJECT_WINDOW_SECONDS, PEOPLE_ENGINES, type EngineId } from "./engines.ts"; // .ts: the tests run it in Node

export type Device = { ramGB: number; vramGB: number; gpu: string };

const GB = 1024 ** 3;

// Left for Windows, the browser, this app and the proxy when sizing a clip to the machine's RAM.
export const RAM_HEADROOM_GB = 8;

// Below this, a GPU counts as small for MemoryNeed.smallGpuRamGB (a 24 GB card reports about 23.99 GB).
export const SMALL_GPU_GB = 23;

// { system: { ram_total }, devices: [{ name, vram_total }] } in bytes -> GB; null when either is missing.
export function deviceFromStats(stats: unknown): Device | null {
  const s = stats as { system?: { ram_total?: unknown }; devices?: { name?: unknown; vram_total?: unknown }[] } | null;
  const ram = Number(s?.system?.ram_total);
  const gpu = s?.devices?.[0];
  const vram = Number(gpu?.vram_total);
  if (!(ram > 0 && vram > 0)) return null;
  const name = typeof gpu?.name === "string" ? gpu.name.replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*\w+$/, "") : "GPU";
  return { ramGB: round1(ram / GB), vramGB: round1(vram / GB), gpu: name };
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function engineCap(id: EngineId): number {
  return id === "object" ? MAX_OBJECT_SECONDS : MAX_CLIP_SECONDS;
}

// The shortest clip the engine handles well, in seconds.
export function engineMin(id: EngineId): number {
  return id === "object" ? MIN_OBJECT_SECONDS : 1;
}

// The longest clip the engine can take on this machine, in whole seconds; 0 when it does not run there at all,
// including when not even its shortest clip fits. An object clip is made of 5 s windows, each padded to 5 s: it fits
// at any length up to the clip cap when one window fits. Without a device (a Comfy API deployment, or ComfyUI not
// answering) the fixed caps apply.
export function maxSecondsOn(id: EngineId, device: Device | null): number {
  const cap = id === "object" ? MAX_CLIP_SECONDS : engineCap(id);
  if (!device) return cap;
  const need = ENGINES[id].memory;
  if (device.vramGB < need.minVramGB) return 0;
  const base = device.vramGB < SMALL_GPU_GB ? need.smallGpuRamGB ?? need.ramGB : need.ramGB;
  const seconds = Math.floor((device.ramGB - RAM_HEADROOM_GB - base) / need.ramPerSecondGB);
  if (id === "object") return seconds >= OBJECT_WINDOW_SECONDS ? cap : 0;
  return seconds >= engineMin(id) ? Math.min(cap, seconds) : 0;
}

// The longest clip for a mode on this machine: the lowest limit among its engines, so the length depends on the
// machine only, never on which engine is chosen. 0 when the mode does not run there.
export function modeMaxSeconds(object: boolean, device: Device | null): number {
  return Math.min(...(object ? (["object"] as EngineId[]) : PEOPLE_ENGINES).map((id) => maxSecondsOn(id, device)));
}

// Why an engine cannot take a clip of this length here, or null when it can.
export function fitProblem(id: EngineId, device: Device | null, seconds: number): string | null {
  const max = maxSecondsOn(id, device);
  const min = engineMin(id);
  if (seconds <= max && seconds >= min) return null;
  const choice = ENGINES[id].choice;
  const need = ENGINES[id].memory;
  if (device && device.vramGB < need.minVramGB) {
    return `${choice} needs a GPU with at least ${need.minVramGB} GB; this one has ${device.vramGB} GB.`;
  }
  if (max === 0) return `${choice} needs more than the ${device?.ramGB} GB of RAM on this machine.`;
  if (seconds < min) return `${choice} needs ${min} s of the clip: shorter object clips lost the new object partway in tests.`;
  return `${choice} takes up to ${max} s on this machine (${device?.ramGB} GB RAM). Shorten the clip in step 1.`;
}
