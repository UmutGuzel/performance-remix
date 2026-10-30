// Engine table, workflow input maps, prompt recipes and output size: pure data and functions shared by
// the API routes, the UI and the tests (no Node or SDK imports here).

export type EngineId = "viggle" | "fun" | "detail" | "scail2" | "object";

// People: the person engines; Object: one thing (a car, a product, clothes) through the object engine.
export type SwapMode = "people" | "object";
export const PEOPLE_ENGINES: EngineId[] = ["viggle", "fun", "detail", "scail2"];

// [node id, input field] in a file in workflows/api. test/workflows.test.ts checks each one exists.
export type InputRef = readonly [string, string];

export type EngineInputs = {
  still: InputRef;
  video: InputRef;
  start: InputRef;
  duration: InputRef;
  seed: InputRef;
  width?: InputRef;
  height?: InputRef;
  prompt?: InputRef;
  faceReference?: InputRef;
  facePass?: InputRef;
  // Object engine: what to replace (tracked in the clip) and what it becomes (found in the look and the redraw).
  subject?: InputRef;
  newSubject?: InputRef;
  // Object engine: the time (s, from the window's start) of the redrawn frame saved for the next window.
  handoff?: InputRef;
};

export type Engine = {
  id: EngineId;
  label: string;
  choice: string;
  workflow: string;
  outputNode: string;
  inputs: EngineInputs;
  summary: string;
  license: string;
  // Measured render seconds per second of clip on a 32 GB GPU (see workflows/README.md).
  secondsPerClipSecond: number;
  memory: MemoryNeed;
  // Object engine: the save node of the frame the next window starts from.
  handoffNode?: string;
};

// What a video job needs, measured through the app (workflows/README.md, "Memory"): physical RAM in use is
// ramGB + ramPerSecondGB per second of 30 fps clip, set at or above every measured run. On a GPU smaller than 24 GB
// more of the model stays in RAM: smallGpuRamGB, when set, is the base there instead. minVramGB is the smallest GPU
// memory it ran on in the tests (limited to what a 16 GB card has).
export type MemoryNeed = { ramGB: number; ramPerSecondGB: number; minVramGB: number; smallGpuRamGB?: number };

const CLIP_INPUTS = { still: ["2", "image"], video: ["3", "file"], start: ["4", "start_time"], duration: ["4", "duration"] } as const;
// Fast and "Best for animals" share one graph; the second drops the speed LoRAs and samples 20 steps.
const FUN_INPUTS = { ...CLIP_INPUTS, prompt: ["67", "text"], seed: ["68", "noise_seed"], faceReference: ["26", "image"], facePass: ["34", "switch"] } as const;

export const ENGINES: Record<EngineId, Engine> = {
  viggle: {
    id: "viggle",
    label: "Viggle-Animate",
    choice: "Best for people",
    workflow: "stage2_motion_viggle.api.json",
    outputNode: "18",
    // the clip is decoded at the output size (node 5), and the Viggle conditioning takes its size from there
    inputs: { ...CLIP_INPUTS, width: ["5", "width"], height: ["5", "height"], seed: ["16", "seed"] },
    summary: "Sharpest faces and closest likeness; uses all of the GPU's memory; cannot animate animals.",
    license: "MiniMax H3 Community License: not for local use in the US, EU, UK or South Korea without a commercial license.",
    secondsPerClipSecond: 75,
    memory: { ramGB: 5, ramPerSecondGB: 0.76, minVramGB: 15 },
  },
  fun: {
    id: "fun",
    label: "Wan2.2 Fun Control",
    choice: "Fast",
    workflow: "stage2_motion_fun.api.json",
    outputNode: "24",
    inputs: FUN_INPUTS,
    summary: "About twice as fast; follows the body most closely; also animates animals; faces are softer.",
    license: "Apache 2.0.",
    // At 720x1280: 246 s for a 5 s clip through the app (576x1024 took 152 s, but fur and faces came out soft).
    secondsPerClipSecond: 50,
    memory: { ramGB: 5.1, ramPerSecondGB: 0.84, minVramGB: 15 },
  },
  detail: {
    id: "detail",
    label: "Wan2.2 Fun Control, full sampling",
    choice: "Best for animals (slow)",
    workflow: "stage2_motion_fun_detail.api.json",
    outputNode: "24",
    inputs: FUN_INPUTS,
    summary: "Fast without its 4-step speed LoRA: 20 steps. Steadier, more natural fur and hair; about 8 times slower than Fast.",
    license: "Apache 2.0.",
    // 1899 s for a 5 s clip at 720x1280 (Fast: 246 s); fur sharpness flicker 0.082 instead of 0.125.
    secondsPerClipSecond: 380,
    memory: { ramGB: 5.1, ramPerSecondGB: 0.84, minVramGB: 15 },
  },
  scail2: {
    id: "scail2",
    label: "SCAIL-2",
    choice: "Keep background",
    workflow: "stage2_motion_scail2.api.json",
    outputNode: "28",
    inputs: { ...CLIP_INPUTS, width: ["5", "width"], height: ["5", "height"], prompt: ["19", "text"], seed: ["26", "noise_seed"] },
    summary: "Replaces only the people and keeps the clip's own room; copies expressions well.",
    license: "MIT; SAM 3.1 under the SAM License.",
    secondsPerClipSecond: 115,
    memory: { ramGB: 5, ramPerSecondGB: 1.26, minVramGB: 15 },
  },
  object: {
    id: "object",
    label: "LTX-2.5 inpaint",
    choice: "Redraw the object and its shadow",
    workflow: "stage2_motion_object.api.json",
    outputNode: "5228",
    inputs: {
      still: ["2004", "image"],
      video: ["5368", "file"],
      start: ["9001", "start_time"],
      duration: ["9001", "duration"],
      prompt: ["5404", "value"],
      seed: ["5410:4832", "noise_seed"],
      subject: ["9102", "text"],
      newSubject: ["9120", "text"],
      handoff: ["9141", "seconds"],
    },
    handoffNode: "9142",
    summary: "Redraws only the object, in the shape from the look, and its shadow. SAM 3 tracks the old and the new object; the rest is the original clip.",
    license: "LTX-2.x Community License (free under 10 million USD yearly revenue); SAM 3.1 under the SAM License.",
    // Measured 63 to 78 on three 5 s clips through the app, including model loading; the head trackers add about 20 s.
    secondsPerClipSecond: 85,
    memory: { ramGB: 8.2, ramPerSecondGB: 2.86, minVramGB: 15, smallGpuRamGB: 13 },
  },
};

// LTX redraws a whole window in one pass and the paste-back holds it in memory: one object job takes at most 5 s.
// Longer clips are made of 5 s windows (objectWindows) joined by the join workflow.
export const MAX_OBJECT_SECONDS = 5;
// Object clips take any length from 1 s: the object workflow pads each window to at least 145 frames and an 8k+1 count
// by holding the last frame, and cuts the result back to the clip's own length (node pack, Pad Frames for LTX).
export const MIN_OBJECT_SECONDS = 1;

// A long object clip is made of 5 s windows starting 4.5 s apart: each join has 0.5 s that both windows cover, and
// window k + 1 opens with the frame window k redrew at its start. The last window can be shorter (it is padded),
// but at least 1 s, so a short tail starts a little earlier instead.
export const OBJECT_WINDOW_SECONDS = MAX_OBJECT_SECONDS;
export const OBJECT_WINDOW_STEP = 4.5;
export type ClipWindow = { start: number; duration: number };

export function objectWindows(seconds: number): ClipWindow[] {
  const round = (value: number) => Math.round(value * 100) / 100;
  const windows: ClipWindow[] = [];
  for (let start = 0; ; start = round(start + OBJECT_WINDOW_STEP)) {
    if (start + OBJECT_WINDOW_SECONDS >= seconds - 1e-6) {
      const last = Math.max(0, Math.min(start, round(seconds - 1)));
      windows.push({ start: last, duration: round(seconds - last) });
      return windows;
    }
    windows.push({ start, duration: OBJECT_WINDOW_SECONDS });
  }
}

// Joins the windows of a long object clip on the clip's own frame times, with its audio (node pack, Join Object
// Windows). Window k is loaded by windows[k]; the app deletes the loaders it does not use.
export const JOIN_WORKFLOW = {
  file: "join_object_windows.api.json",
  outputNode: "3",
  inputs: { video: ["1", "file"], start: ["2", "start_time"], duration: ["2", "duration"], starts: ["3", "starts"] },
  windows: ["11", "12", "13", "14", "15", "16", "17", "18"],
} as const;
export const JOIN_SECONDS_PER_CLIP_SECOND = 2;

// An own first frame (an object swap that skips the look) must have the clip's shape: the workflow stretches the
// still to the clip's frame and pastes it inside the object's area, so a cropped frame lands in the wrong place.
export const FRAME_SHAPE_TOLERANCE = 0.02;

type Size = { width: number; height: number };

export function frameShapeError(frame: Size, clip: Size): string | null {
  if (!(frame.width > 0 && frame.height > 0 && clip.width > 0 && clip.height > 0)) return "Could not read the frame's size.";
  const ratio = frame.width / frame.height / (clip.width / clip.height);
  if (Math.abs(ratio - 1) <= FRAME_SHAPE_TOLERANCE) return null;
  return `Your frame is ${frame.width}x${frame.height} and the clip is ${clip.width}x${clip.height}: edit the downloaded first frame without cropping it.`;
}

export const LOOK_WORKFLOW = {
  file: "stage1_look.api.json",
  outputNode: "23",
  inputs: {
    video: ["2", "file"],
    start: ["3", "start_time"],
    image: ["7", "image"],
    candidates: ["13", "amount"],
    prompt: ["17", "prompt"],
    seed: ["21", "seed"],
  },
  // An object swap may come with a description only: the app then drops the reference image from both
  // prompt encoders and deletes its loader.
  reference: { node: "7", users: ["17", "18"], field: "image2" },
  // An object swap hides the old object from the edit model: these nodes find it with SAM 3 on the frame and
  // fill it (grown 24 px) with flat gray before the frame is scaled. Shown the old object, even blurred, Qwen kept
  // its design (6 of 6 looks kept a BMW grille); shown a gray silhouette, 0 of 2 did.
  hideObject: { frame: ["5", 0], target: ["6", "image"], subjectNode: "41", nodes: ["40", "41", "42", "43", "44", "45", "46", "47"] },
} as const;

export const FINISH_WORKFLOW = {
  file: "finish.api.json",
  outputNode: "5",
  inputs: { video: ["2", "file"], scale: ["5", "scale"], sharpen: ["5", "sharpen"], contrast: ["5", "contrast"], seed: ["5", "seed"] },
} as const;

// Save nodes: a job also lists its uploaded inputs, so results are picked by node.
export const LOOK_OUTPUT_NODE = LOOK_WORKFLOW.outputNode;
export const FINISH_OUTPUT_NODE = FINISH_WORKFLOW.outputNode;
export const JOIN_OUTPUT_NODE = JOIN_WORKFLOW.outputNode;
export const LOOK_CANDIDATES = 2;
export const LOOK_SECONDS = 40;
export const MAX_CLIP_SECONDS = 30;
export const MAX_DIRECTION_LENGTH = 500;

export const MAX_SUBJECT_LENGTH = 60;

export function isEngineId(value: unknown): value is EngineId {
  return value === "viggle" || value === "fun" || value === "detail" || value === "scail2" || value === "object";
}

export function isSwapMode(value: unknown): value is SwapMode {
  return value === "people" || value === "object";
}

// Stage 1 wording chosen in tests on two clips (claudedocs notes, 2026-10-24): softer wordings changed the
// clothes but kept the original face and glasses; this one plus a short description of the character
// replaced the whole person in both.
export function lookPrompt(description: string): string {
  const base =
    "Remove the person in image 1 completely and put the person from image 2 in exactly the same pose, position, " +
    "size in frame and camera angle. Use the face, age, skin, hair, headwear, glasses or no glasses, and clothes of " +
    "the person in image 2. Nothing of the person in image 1 stays: not the face, not the hair, not the glasses, not " +
    "the clothes. Keep the room, the objects and the light of image 1 unchanged.";
  const text = description.trim();
  return text ? `${base} The person from image 2: ${text}` : base;
}

export function motionPrompt(description: string): string {
  const text = description.trim();
  const who = text ? `The character (${text})` : "The character from the reference image";
  return `${who} performs the movements of the person in the video, in the same place, with the same camera.`;
}

// "the silver car." -> "silver car": the noun phrase SAM 3 tracks and the prompts name.
export function subjectPhrase(text: string): string {
  return text.trim().replace(/[.!?,;:]+$/, "").replace(/^(the|a|an)(\s+|$)/i, "").replace(/\s+/g, " ").trim();
}

// Stage 1 for an object: the old thing is a gray shape in image 1 (hideOldObject); the new thing goes in its place
// and angle but takes its own shape, since stage 2 widens the redraw area to fit it. The photo and people lines
// answer looks that came out glossy and with a brightly lit driver who was hard to see in the clip (2026-10-29 tests).
export function objectLookPrompt(subject: string, description: string, hasImage: boolean): string {
  const what = subjectPhrase(subject);
  const text = description.trim();
  const target = hasImage ? `the one shown in image 2${text ? `: ${text}` : ""}` : text;
  return `In image 1 a flat gray shape covers the ${what}. Replace the gray shape with ${target}. Nothing of the ${what} ` +
    "stays. Put the new one in the same position, size in frame and angle, held or worn the same way. It must look like a " +
    "real photograph taken with the same camera as image 1: the same light, reflections, sharpness and grain, natural " +
    "colours, nothing glossy or plastic, no logos. Anyone inside or behind it stays as hard to see as in image 1; add no " +
    "people. Keep everything else in image 1 exactly as it is: the people, faces, hands, background and light.";
}

// Stage 2 prompt for LTX inpainting: the new thing, then the rest of the scene unchanged (the wording of the
// tested runs, claudedocs/competition-plan.md section 9i). A line saying the object stays where it is put down
// was tried on the 3 s bottle clip: it saved the duck with 1 of 3 seeds and lost it sooner with another, so it is out.
export function objectMotionPrompt(subject: string, description: string): string {
  const text = description.trim().replace(/[.!?,;:]+$/, "") || `the new ${subjectPhrase(subject)} from the reference image`;
  return `${text}. The same scene, camera and light as the rest of the video.`;
}

// "a white 1970s camper van with a tall boxy body, no badges" -> "white 1970s camper van": the noun phrase SAM 3
// looks for in the look and in the redraw. Falls back to the old subject when nothing is left.
export function newSubjectPhrase(description: string, subject: string): string {
  const head = description.split(/[,.;:!?]|\s(?:with|that|which|without)\s/i)[0] ?? "";
  return subjectPhrase(head).split(" ").slice(0, 8).join(" ") || subjectPhrase(subject);
}

// Output size for the engines that take one: the clip's aspect ratio at the tested 704x1248
// area (0.88 megapixels) unless another area is given, both sides multiples of 32. The object engine
// sizes itself (short side 1024, a multiple of 64).
export function outputSize(width: number, height: number, area = 704 * 1248): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return outputSize(9, 16, area);
  const aspect = width / height;
  const round32 = (value: number) => Math.max(256, Math.round(value / 32) * 32);
  return { width: round32(Math.sqrt(area * aspect)), height: round32(Math.sqrt(area / aspect)) };
}

// lookPasses: 1 when the look still has to run first, 0 when a look is picked or skipped. Every object window is
// padded to 5 s, so it takes the time of 5 s whatever its length; several windows add the join.
export function estimateSeconds(engine: EngineId, clipSeconds: number, lookPasses: number): number {
  const windows = engine === "object" ? objectWindows(clipSeconds).length : 0;
  const render = engine === "object"
    ? windows * OBJECT_WINDOW_SECONDS * ENGINES.object.secondsPerClipSecond + (windows > 1 ? JOIN_SECONDS_PER_CLIP_SECOND * clipSeconds : 0)
    : ENGINES[engine].secondsPerClipSecond * clipSeconds;
  return Math.round(render + lookPasses * LOOK_SECONDS);
}

// Turns an API-format look graph into an object look: SAM 3 finds the old object on the frame and it is filled
// with flat gray before the edit model sees it. Changes the graph in place.
export function hideOldObject(graph: Record<string, unknown>, subject: string): void {
  const { frame, target, nodes } = LOOK_WORKFLOW.hideObject;
  for (const id of nodes) if (id in graph) throw new Error(`Node ${id} already exists in the look workflow.`);
  const [targetNode, field] = target;
  const scaler = graph[targetNode] as { inputs?: Record<string, unknown> } | undefined;
  if (!scaler?.inputs || !(field in scaler.inputs)) throw new Error(`The look workflow has no input ${targetNode}.${field}.`);
  const node = (class_type: string, title: string, inputs: Record<string, unknown>) => ({ inputs, class_type, _meta: { title } });
  Object.assign(graph, {
    40: node("CheckpointLoaderSimple", "SAM 3.1", { ckpt_name: "sam3.1_multiplex_fp16.safetensors" }),
    41: node("CLIPTextEncode", "What to replace", { text: subjectPhrase(subject), clip: ["40", 1] }),
    42: node("SAM3_Detect", "Find it in the frame", { threshold: 0.5, refine_iterations: 2, individual_masks: false, model: ["40", 0], image: [...frame], conditioning: ["41", 0] }),
    43: node("GrowMask", "Grow 24 px", { expand: 24, tapered_corners: true, mask: ["42", 0] }),
    44: node("GetImageSize", "Frame size", { image: [...frame] }),
    45: node("SolidMask", "Gray", { value: 0.5, width: ["44", 0], height: ["44", 1] }),
    46: node("MaskToImage", "Gray image", { mask: ["45", 0] }),
    47: node("ImageCompositeMasked", "Hide the old object", { x: 0, y: 0, resize_source: true, destination: [...frame], source: ["46", 0], mask: ["43", 0] }),
  });
  scaler.inputs[field] = ["47", 0];
}

// Turns an API-format look graph into one without a reference image (an object described in words only).
// Changes the graph in place.
export function dropReference(graph: Record<string, unknown>): void {
  const { node, users, field } = LOOK_WORKFLOW.reference;
  for (const id of users) {
    const encoder = graph[id] as { inputs?: Record<string, unknown> } | undefined;
    if (!encoder?.inputs || !(field in encoder.inputs)) throw new Error(`The look workflow has no input ${id}.${field}.`);
    delete encoder.inputs[field];
  }
  delete graph[node];
}
