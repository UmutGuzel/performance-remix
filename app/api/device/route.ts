import { readDevice } from "../../../lib/device-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The machine ComfyUI runs on (RAM, GPU memory, GPU name), or null when it cannot be read.
export async function GET() {
  return Response.json({ device: await readDevice() });
}
