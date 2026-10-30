import { MAX_CLIP_SECONDS, MAX_DIRECTION_LENGTH, MAX_SUBJECT_LENGTH, isSwapMode, subjectPhrase, type SwapMode } from "./engines";
import type { ClipRange } from "./comfy";

const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export class InputError extends Error {}

export function videoFile(form: FormData): File {
  const file = form.get("video");
  if (!(file instanceof File) || file.size === 0) throw new InputError("Choose a video clip.");
  if (!VIDEO_TYPES.includes(file.type)) throw new InputError("Use an MP4 or MOV video.");
  if (file.size > MAX_VIDEO_BYTES) throw new InputError("Keep the video under 300 MB.");
  return file;
}

export function imageFile(form: FormData, field: string, missing = "Add a character image."): File {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) throw new InputError(missing);
  if (!IMAGE_TYPES.includes(file.type)) throw new InputError("Use a PNG, JPEG or WebP image.");
  if (file.size > MAX_IMAGE_BYTES) throw new InputError("Keep the image under 30 MB.");
  return file;
}

export function optionalImageFile(form: FormData, field: string): File | null {
  const file = form.get(field);
  if (file === null || (file instanceof File && file.size === 0)) return null;
  return imageFile(form, field);
}

export function swapMode(form: FormData): SwapMode {
  const mode = form.get("mode") ?? "people";
  if (!isSwapMode(mode)) throw new InputError("Choose People or Object.");
  return mode;
}

// What to replace in an object swap, as typed ("the silver car"); SAM 3 gets its noun phrase.
export function subject(form: FormData): string {
  const text = form.get("subject");
  if (typeof text !== "string" || !subjectPhrase(text)) throw new InputError("Say what to replace in the video, for example: the car.");
  if (text.length > MAX_SUBJECT_LENGTH) throw new InputError(`Keep "what to replace" under ${MAX_SUBJECT_LENGTH} characters.`);
  return text;
}

export function requiredDirection(form: FormData, field = "direction"): string {
  const text = direction(form, field);
  if (!text.trim()) throw new InputError("Say what it becomes, in a few words.");
  return text;
}

export function intInRange(form: FormData, field: string, min: number, max: number, fallback?: number): number {
  const raw = form.get(field);
  if (raw === null && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new InputError(`${field} must be a whole number from ${min} to ${max}.`);
  return value;
}

export function clipRange(form: FormData, maxSeconds = MAX_CLIP_SECONDS): ClipRange {
  const start = Number(form.get("start") ?? 0);
  const duration = Number(form.get("duration") ?? 0);
  if (!Number.isFinite(start) || start < 0) throw new InputError("The start time must be 0 or more seconds.");
  if (!Number.isFinite(duration) || duration < 1 || duration > maxSeconds) {
    throw new InputError(`Choose a length between 1 and ${maxSeconds} seconds.`);
  }
  return { start, duration };
}

export function direction(form: FormData, field = "direction"): string {
  const text = form.get(field);
  if (text !== null && typeof text !== "string") throw new InputError("Extra direction must be text.");
  if ((text ?? "").length > MAX_DIRECTION_LENGTH) throw new InputError(`Keep extra direction under ${MAX_DIRECTION_LENGTH} characters.`);
  return text ?? "";
}

export function seed(form: FormData): number {
  const value = Number(form.get("seed"));
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new InputError("The seed must be a whole number.");
  return value;
}

// 0 when the field is not sent.
export function optionalSeconds(form: FormData, field: string, max: number): number {
  const raw = form.get(field);
  if (raw === null || raw === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > max) throw new InputError(`${field} must be from 0 to ${max} seconds.`);
  return value;
}

// The windows of a long object clip, as the client sends them: [{ start, jobId, outputId }], starts from 0 up.
export function windowParts(form: FormData, maxParts: number): { start: number; jobId: string; outputId: string }[] {
  let parts: unknown;
  try {
    parts = JSON.parse(String(form.get("parts") ?? ""));
  } catch {
    throw new InputError("Missing parts.");
  }
  const id = (value: unknown) => typeof value === "string" && ID.test(value);
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > maxParts) throw new InputError(`Send 1 to ${maxParts} parts.`);
  return parts.map((part, k) => {
    const { start, jobId, outputId } = (part ?? {}) as Record<string, unknown>;
    const previous = k ? Number((parts as Record<string, unknown>[])[k - 1].start) : -1;
    if (typeof start !== "number" || !Number.isFinite(start) || start <= previous || (k === 0 && start !== 0) || !id(jobId) || !id(outputId)) {
      throw new InputError(`Part ${k + 1} is not valid.`);
    }
    return { start, jobId: jobId as string, outputId: outputId as string };
  });
}

export function positiveNumber(form: FormData, field: string): number {
  const value = Number(form.get(field));
  if (!Number.isFinite(value) || value <= 0) throw new InputError(`Missing ${field}.`);
  return value;
}

// Job and output ids. An SDK output id is a signed token, about 200 characters for a video in a subfolder.
const ID = /^[A-Za-z0-9_.:-]{1,400}$/;

export function requiredText(form: FormData, field: string): string {
  const value = form.get(field);
  if (typeof value !== "string" || !ID.test(value)) throw new InputError(`Missing ${field}.`);
  return value;
}

// ComfyUI's validation errors arrive as SDK error details: { node_errors: { id: { class_type, errors: [...] } } }.
function nodeErrors(error: unknown): string {
  const details = error && typeof error === "object" ? Reflect.get(error, "details") : null;
  const nodes = details && typeof details === "object" ? Reflect.get(details, "node_errors") : null;
  if (!nodes || typeof nodes !== "object") return "";
  return Object.entries(nodes as Record<string, { class_type?: string; errors?: { message?: string; details?: string }[] }>)
    .map(([id, node]) => `${node.class_type ?? "node"} ${id}: ${(node.errors ?? []).map((e) => [e.message, e.details].filter(Boolean).join(", ")).join("; ")}`)
    .join(" | ");
}

export function errorResponse(error: unknown) {
  if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
  const message = error instanceof Error ? error.message : "ComfyUI did not accept the job.";
  const nodes = nodeErrors(error);
  return Response.json({ error: nodes ? `${message}: ${nodes}` : message }, { status: 502 });
}
