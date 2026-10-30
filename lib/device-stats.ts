import { deviceFromStats, type Device } from "./device";

// ComfyUI itself, not the API proxy: the proxy does not pass /system_stats on. Empty COMFYUI_URL (a Comfy API
// deployment) means no device, and the fixed clip caps apply.
const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";
const KEEP_MS = 60_000;

let cached: { at: number; device: Device | null } | null = null;

export async function readDevice(): Promise<Device | null> {
  if (!COMFYUI_URL) return null;
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.device;
  let device: Device | null = null;
  try {
    const response = await fetch(`${COMFYUI_URL.replace(/\/$/, "")}/system_stats`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (response.ok) device = deviceFromStats(await response.json());
  } catch {
    device = null; // ComfyUI busy or away: the fixed caps apply until the next read
  }
  cached = { at: Date.now(), device };
  return device;
}
