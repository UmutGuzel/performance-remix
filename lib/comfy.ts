import { join } from "node:path";
import { Comfy, type Job, type Output, type Workflow } from "@comfyorg/sdk";
import {
  ENGINES,
  FINISH_WORKFLOW,
  JOIN_WORKFLOW,
  LOOK_WORKFLOW,
  dropReference,
  hideOldObject,
  lookPrompt,
  motionPrompt,
  newSubjectPhrase,
  objectLookPrompt,
  objectMotionPrompt,
  outputSize,
  subjectPhrase,
  type EngineId,
  type InputRef,
} from "./engines";

export type JobOutput = { id: string; nodeId: string; name: string; type: string; contentType: string; url: string };
export type PublicJob = {
  id: string;
  status: string;
  progress: { value: number; message: string | null; step: number | null; steps: number | null } | null;
  queuePosition: number | null;
  outputs: JobOutput[];
  error: unknown;
};

// COMFY_BASE_URL picks the target: the local comfy-api-proxy, or a Comfy API deployment
// (then COMFY_API_KEY is needed too). See .env.example.
function client() {
  return new Comfy({ clientInfo: "performance-remix" });
}

function workflowPath(file: string) {
  return join(process.cwd(), "workflows", "api", file);
}

function set(workflow: Workflow, [node, field]: InputRef, value: unknown) {
  workflow.setInput(node, field, value);
}

function publicJob(job: Job): PublicJob {
  const progress = job.progress;
  return {
    id: job.id,
    status: job.status,
    progress: progress ? { value: progress.value, message: progress.message, step: progress.step, steps: progress.steps } : null,
    queuePosition: job.queuePosition,
    outputs: job.outputs.map((output) => ({
      id: output.id,
      nodeId: output.nodeId,
      name: output.name,
      type: String(output.type),
      contentType: output.contentType,
      url: `/api/jobs/${job.id}/outputs/${output.id}`,
    })),
    error: job.error,
  };
}

async function fileAsset(comfy: Comfy, file: File, fallbackType: string) {
  return comfy.assets.fromBytes(new Uint8Array(await file.arrayBuffer()), {
    filename: file.name,
    contentType: file.type || fallbackType,
  });
}

async function findOutput(jobId: string, outputId: string): Promise<Output> {
  const job = await client().jobs.get(jobId);
  const output = job.outputs.find((candidate) => candidate.id === outputId);
  if (!output) throw new Error("That output is not on the job any more. Run the step again.");
  return output;
}

export type ClipRange = { start: number; duration: number };

// Stage 1 for a person: the character painted into the clip's first frame.
export async function submitLook(input: {
  video: File;
  range: ClipRange;
  image: File;
  description: string;
  candidates: number;
  seed: number;
}) {
  const comfy = client();
  const workflow = await comfy.workflows.fromFile(workflowPath(LOOK_WORKFLOW.file));
  const map = LOOK_WORKFLOW.inputs;
  set(workflow, map.video, await fileAsset(comfy, input.video, "video/mp4"));
  set(workflow, map.start, input.range.start);
  set(workflow, map.image, await fileAsset(comfy, input.image, "image/png"));
  set(workflow, map.candidates, input.candidates);
  set(workflow, map.seed, input.seed);
  set(workflow, map.prompt, lookPrompt(input.description));
  return publicJob(await comfy.submit(workflow));
}

// Stage 1 for an object: one pass on the clip's first frame. The image of the new thing is optional.
export async function submitObjectLook(input: {
  video: File;
  range: ClipRange;
  image: File | null;
  subject: string;
  description: string;
  candidates: number;
  seed: number;
}) {
  const comfy = client();
  const workflow = await comfy.workflows.fromFile(workflowPath(LOOK_WORKFLOW.file));
  const map = LOOK_WORKFLOW.inputs;
  set(workflow, map.video, await fileAsset(comfy, input.video, "video/mp4"));
  set(workflow, map.start, input.range.start);
  hideOldObject(workflow.json, input.subject);
  if (input.image) set(workflow, map.image, await fileAsset(comfy, input.image, "image/png"));
  else dropReference(workflow.json);
  set(workflow, map.candidates, input.candidates);
  set(workflow, map.seed, input.seed);
  set(workflow, map.prompt, objectLookPrompt(input.subject, input.description, Boolean(input.image)));
  return publicJob(await comfy.submit(workflow));
}

export type StillSource = { kind: "upload"; file: File } | { kind: "output"; jobId: string; outputId: string };

export async function submitVideo(input: {
  engine: EngineId;
  video: File;
  still: StillSource;
  range: ClipRange;
  clipWidth: number;
  clipHeight: number;
  // The character (may be empty); for the object engine, the new thing.
  description: string;
  // Object engine only: what to replace in the clip, for SAM 3 and the prompt.
  subject?: string;
  // Object engine only: seconds into this window of the frame the next window starts from (0 for the last).
  handoffSeconds?: number;
  seed: number;
}) {
  const comfy = client();
  const engine = ENGINES[input.engine];
  const map = engine.inputs;
  const workflow = await comfy.workflows.fromFile(workflowPath(engine.workflow));
  const still =
    input.still.kind === "upload"
      ? await fileAsset(comfy, input.still.file, "image/png")
      : comfy.assets.fromBytes(await (await findOutput(input.still.jobId, input.still.outputId)).toBytes(), {
          filename: "approved_still.png",
          contentType: "image/png",
        });
  const size = outputSize(input.clipWidth, input.clipHeight);

  set(workflow, map.still, still);
  set(workflow, map.video, await fileAsset(comfy, input.video, "video/mp4"));
  set(workflow, map.start, input.range.start);
  set(workflow, map.duration, input.range.duration);
  set(workflow, map.seed, input.seed);
  if (map.width && map.height) {
    set(workflow, map.width, size.width);
    set(workflow, map.height, size.height);
  }
  if (map.subject) {
    // The object engine: SAM 3 tracks the old thing by name and finds the new one by the head of its
    // description; the prompt describes what replaces it.
    const subject = input.subject ?? "";
    set(workflow, map.subject, subjectPhrase(subject));
    if (map.newSubject) set(workflow, map.newSubject, newSubjectPhrase(input.description, subject));
    if (map.prompt) set(workflow, map.prompt, objectMotionPrompt(subject, input.description));
  } else if (map.prompt) {
    set(workflow, map.prompt, motionPrompt(input.description));
  }
  if (map.faceReference) set(workflow, map.faceReference, still); // Fun Control's face pass is off; its loader still needs a file
  if (map.facePass) set(workflow, map.facePass, false);
  if (map.handoff) set(workflow, map.handoff, input.handoffSeconds ?? 0);
  return publicJob(await comfy.submit(workflow));
}

export type WindowPart = { start: number; jobId: string; outputId: string };

// A long object clip: the windows' videos joined on the clip's own frame times, with its audio. Window loaders the
// clip does not need are deleted from the graph with their join inputs.
export async function submitJoin(input: { video: File; range: ClipRange; parts: WindowPart[] }) {
  const comfy = client();
  const workflow = await comfy.workflows.fromFile(workflowPath(JOIN_WORKFLOW.file));
  const map = JOIN_WORKFLOW.inputs;
  set(workflow, map.video, await fileAsset(comfy, input.video, "video/mp4"));
  set(workflow, map.start, input.range.start);
  set(workflow, map.duration, input.range.duration);
  set(workflow, map.starts, input.parts.map((part) => part.start).join(","));
  const graph = workflow.json as Record<string, { inputs: Record<string, unknown> }>;
  for (const [k, node] of JOIN_WORKFLOW.windows.entries()) {
    const part = input.parts[k];
    if (part) {
      const output = await findOutput(part.jobId, part.outputId);
      workflow.setInput(node, "file", comfy.assets.fromBytes(await output.toBytes(), { filename: `window_${k + 1}.mp4`, contentType: "video/mp4" }));
    } else {
      delete graph[node];
      delete graph[JOIN_WORKFLOW.outputNode].inputs[`window_${k + 1}`];
    }
  }
  return publicJob(await comfy.submit(workflow));
}

export async function submitFinish(input: { jobId: string; outputId: string; seed: number }) {
  const comfy = client();
  const workflow = await comfy.workflows.fromFile(workflowPath(FINISH_WORKFLOW.file));
  const map = FINISH_WORKFLOW.inputs;
  const video = await findOutput(input.jobId, input.outputId);
  set(workflow, map.video, comfy.assets.fromBytes(await video.toBytes(), { filename: "motion.mp4", contentType: "video/mp4" }));
  set(workflow, map.scale, 1.5);
  set(workflow, map.sharpen, 0);
  set(workflow, map.contrast, 1.0);
  set(workflow, map.seed, input.seed);
  return publicJob(await comfy.submit(workflow));
}

export async function getJob(id: string) {
  return publicJob(await client().jobs.get(id));
}

export async function cancelJob(id: string) {
  const job = await client().jobs.get(id);
  return publicJob(await job.cancel());
}

export async function getOutput(jobId: string, outputId: string) {
  const output = await findOutput(jobId, outputId);
  const { url } = await output.getDownloadUrl();
  return fetch(url);
}
