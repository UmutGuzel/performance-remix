"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ENGINES,
  FINISH_OUTPUT_NODE,
  JOIN_OUTPUT_NODE,
  JOIN_SECONDS_PER_CLIP_SECOND,
  LOOK_CANDIDATES,
  LOOK_OUTPUT_NODE,
  LOOK_SECONDS,
  MAX_DIRECTION_LENGTH,
  MAX_SUBJECT_LENGTH,
  PEOPLE_ENGINES,
  estimateSeconds,
  frameShapeError,
  objectWindows,
  subjectPhrase,
  type EngineId,
  type SwapMode,
} from "../lib/engines";
import { engineMin, fitProblem, modeMaxSeconds, type Device } from "../lib/device";
import { jobErrorMessage } from "../lib/job-error";

type Output = { id: string; nodeId: string; name: string; type: string; contentType: string; url: string };
type Job = {
  id: string;
  status: string;
  progress: { value: number; message: string | null; step: number | null; steps: number | null } | null;
  queuePosition: number | null;
  outputs: Output[];
  error?: unknown;
};
type Phase = "idle" | "look" | "video" | "finish";
type ClipMeta = { duration: number; width: number; height: number };
// The person in the clip: the character image that replaces them and its description.
type Person = { file: File | null; description: string };
// An object swap: what to replace in the clip, and what it becomes. The image is an optional reference of the new
// object, or, when the look is skipped, the user's own first frame with the new object already in place.
type Thing = { subject: string; file: File | null; description: string };
type Size = { width: number; height: number };

const ACTIVE = ["queued", "pending", "running"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function minutes(seconds: number) {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function isImage(output: Output) {
  return output.contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(output.name);
}

function isVideo(output: Output) {
  return output.contentType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(output.name);
}

function engineTip(id: EngineId) {
  const engine = ENGINES[id];
  return `${engine.label}. ${engine.summary} License: ${engine.license}`;
}

// Step 2 of an object swap: what to replace, what it becomes and, when the look is skipped, the own first frame.
function objectFilled(thing: Thing, ownFrame: boolean) {
  return Boolean(subjectPhrase(thing.subject) && thing.description.trim() && (!ownFrame || thing.file));
}

function objectHint(thing: Thing, ownFrame: boolean) {
  if (!subjectPhrase(thing.subject) || !thing.description.trim()) return "Step 2: say what to replace and name what it becomes.";
  if (ownFrame && !thing.file) return "Step 2: add your edited first frame (download it in step 3, put the new one in, upload it).";
  return ownFrame ? "Step 4: make the video." : "Step 3: make the looks and pick one.";
}

// The URL is made and revoked by the same effect: with useMemo, React's dev double mount revoked it before the
// image loaded and the thumbnail showed as broken.
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt="" className="thumb" /> : null;
}

export function RemixApp() {
  const [video, setVideo] = useState<File | null>(null);
  const [clip, setClip] = useState<ClipMeta | null>(null);
  const [mode, setMode] = useState<SwapMode>("people");
  const [person, setPerson] = useState<Person>({ file: null, description: "" });
  const [thing, setThing] = useState<Thing>({ subject: "", file: null, description: "" });
  const [ownFrame, setOwnFrame] = useState(false);
  const [thingSize, setThingSize] = useState<Size | null>(null);
  const [start, setStart] = useState(0);
  const [length, setLength] = useState(5);
  const [fit, setFit] = useState(true);
  const [engine, setEngine] = useState<EngineId>("viggle");
  const [seed, setSeed] = useState(0);
  const [device, setDevice] = useState<Device | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("Start with step 1: upload a video.");
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [lookJobId, setLookJobId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Output[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ jobId: string; output: Output; engine: EngineId } | null>(null);
  const [finished, setFinished] = useState<Output | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const cancelled = useRef(false);
  const clipRef = useRef<HTMLVideoElement>(null);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);

  const videoUrl = useMemo(() => (video ? URL.createObjectURL(video) : undefined), [video]);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => setSeed(randomSeed()), []);
  // the machine ComfyUI runs on, for the clip lengths each engine fits; null keeps the fixed caps
  useEffect(() => {
    fetch("/api/device").then((response) => response.json()).then((body: { device: Device | null }) => setDevice(body.device)).catch(() => setDevice(null));
  }, []);
  useEffect(() => {
    for (const element of [clipRef.current, beforeRef.current]) if (element) element.currentTime = start;
  }, [start, videoUrl, result]);
  // the object image's size, for the own-first-frame shape check
  useEffect(() => {
    setThingSize(null);
    if (!thing.file) return;
    const url = URL.createObjectURL(thing.file);
    const image = new Image();
    image.onload = () => { setThingSize({ width: image.naturalWidth, height: image.naturalHeight }); URL.revokeObjectURL(url); };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  }, [thing.file]);

  const busy = phase !== "idle";
  const object = mode === "object";
  const subject = subjectPhrase(thing.subject);
  const activeEngine: EngineId = object ? "object" : engine;
  // One limit per mode from this machine, whatever the engine (fixed caps without a device).
  const machineMax = modeMaxSeconds(object, device);
  const maxSeconds = Math.max(1, machineMax);
  const maxLength = clip ? Math.max(1, Math.min(maxSeconds, Math.floor((clip.duration - start) * 10) / 10)) : maxSeconds;
  const minLength = Math.min(engineMin(activeEngine), maxLength);
  const clipLength = Math.min(Math.max(length, minLength), maxLength);
  // The clip goes on after the part used because of the mode's limit, not because the user trimmed it.
  const cutByMachine = clip ? machineMax > 0 && clipLength >= maxSeconds - 0.001 && start + clipLength < clip.duration - 0.05 : false;
  // The start goes no later than leaves room for the shortest clip of this mode.
  const startMax = clip ? Math.max(0, Math.floor((clip.duration - engineMin(activeEngine)) * 10) / 10) : 0;
  const tooLong = fitProblem(activeEngine, device, clipLength);
  // Skip uses the user's own image as the still: a character already in the clip's framing, or an edited first frame.
  const useLook = object ? !ownFrame : fit;
  const needsLook = useLook && !selected;
  const estimate = estimateSeconds(activeEngine, clipLength, needsLook ? 1 : 0);
  const step2Done = object ? objectFilled(thing, ownFrame) : Boolean(person.file);
  const frameProblem = object && ownFrame && clip && thingSize ? frameShapeError(thingSize, clip) : null;
  const ready = Boolean(video && clip && step2Done && !frameProblem && !tooLong && !busy);

  function resetLook() {
    setLookJobId(null); setCandidates([]); setSelected(null); setResult(null); setFinished(null);
  }

  function nextHint(hasVideo: boolean, step2: boolean) {
    if (!hasVideo) return "Start with step 1: upload a video.";
    if (object) return objectHint(thing, ownFrame);
    if (!step2) return "Step 2: add a character image.";
    return useLook ? "Step 3: make the looks and pick one, or go straight to step 4." : "Step 4: choose the quality and make the video.";
  }

  function chooseMode(next: SwapMode) {
    setMode(next); resetLook(); setError(false);
    if (video) setMessage(next === "object"
      ? objectHint(thing, ownFrame)
      : (person.file ? "Step 3: make the looks and pick one, or go straight to step 4." : "Step 2: add a character image."));
  }

  function updateThing(change: Partial<Thing>, own = ownFrame) {
    const next = { ...thing, ...change };
    setThing(next);
    resetLook();
    if (video) { setError(false); setMessage(objectHint(next, own)); }
  }

  // Skip the look: the image field then takes the user's own first frame instead of a reference, so it is cleared.
  function chooseOwnFrame(own: boolean) {
    setOwnFrame(own);
    updateThing({ file: null }, own);
  }

  // The clip's frame at the start time, at the clip's own size, as a PNG to edit in any image editor.
  async function downloadFirstFrame() {
    if (!videoUrl || !video) return;
    try {
      const probe = document.createElement("video");
      probe.muted = true; probe.preload = "auto"; probe.src = videoUrl;
      await new Promise((resolve, reject) => { probe.onloadeddata = resolve; probe.onerror = () => reject(new Error("Could not read this video.")); });
      await new Promise((resolve) => { probe.onseeked = resolve; probe.currentTime = start; });
      const canvas = document.createElement("canvas");
      canvas.width = probe.videoWidth; canvas.height = probe.videoHeight;
      canvas.getContext("2d")?.drawImage(probe, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not make the frame image.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${video.name.replace(/\.[^.]+$/, "")}_frame_${start.toFixed(1)}s.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "Could not save the first frame.");
    }
  }

  function chooseThingImage(file: File | undefined) {
    if (file && !IMAGE_TYPES.includes(file.type)) { setError(true); setMessage("Use a PNG, JPEG or WebP image."); return; }
    setError(false);
    updateThing({ file: file ?? null });
  }

  function chooseVideo(file: File | undefined) {
    setVideo(null); setClip(null); resetLook();
    if (!file) return;
    if (!["video/mp4", "video/quicktime"].includes(file.type)) { setError(true); setMessage("Use an MP4 or MOV video."); return; }
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (!(probe.duration >= 1)) { setError(true); setMessage("This clip is shorter than one second."); return; }
      setClip({ duration: probe.duration, width: probe.videoWidth, height: probe.videoHeight });
      setStart(0);
      setLength(Math.floor(probe.duration * 10) / 10); // the whole clip; clipLength cuts it to what fits
      setVideo(file); setError(false); setMessage(nextHint(true, step2Done));
    };
    probe.onerror = () => { URL.revokeObjectURL(url); setError(true); setMessage("Could not read this video."); };
    probe.src = url;
  }

  function updatePerson(change: Partial<Person>) {
    setPerson((current) => ({ ...current, ...change }));
    resetLook();
  }

  function choosePersonImage(file: File | undefined) {
    if (file && !IMAGE_TYPES.includes(file.type)) { setError(true); setMessage("Use a PNG, JPEG or WebP image."); return; }
    updatePerson({ file: file ?? null });
    setError(false); setMessage(nextHint(Boolean(video), Boolean(file)));
  }

  async function submit(path: string, form: FormData): Promise<Job> {
    const response = await fetch(path, { method: "POST", body: form });
    const body = (await response.json()) as Job & { error?: string };
    if (!response.ok) throw new Error(body.error || "ComfyUI did not accept the job.");
    return body;
  }

  async function follow(job: Job, label: string, estimateSec: number): Promise<Job> {
    setActiveJob(job.id);
    const began = Date.now();
    let current = job;
    while (ACTIVE.includes(current.status)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (cancelled.current) {
        // Cancel pressed while the job was still being sent: cancel() had no job id to stop yet
        await fetch(`/api/jobs/${current.id}`, { method: "DELETE" }).catch(() => undefined);
        throw new Error("Cancelled.");
      }
      const response = await fetch(`/api/jobs/${current.id}`);
      const body = (await response.json()) as Job & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not check the job.");
      current = body;
      const elapsed = (Date.now() - began) / 1000;
      if (current.status === "running" || current.progress) {
        setProgress(current.progress?.value ?? Math.min(0.95, elapsed / Math.max(estimateSec, 1)));
        setMessage(`${label}… ${Math.round(elapsed)} s`);
      } else {
        setProgress(null);
        setMessage(current.queuePosition ? `Waiting in the ComfyUI queue (position ${current.queuePosition})…` : "Waiting for ComfyUI…");
      }
    }
    setActiveJob(null); setProgress(null);
    if (current.status !== "succeeded") throw new Error(`${jobErrorMessage(current.error)} (job ${current.id})`);
    return current;
  }

  function lookResult(job: Job): Output[] {
    const stills = job.outputs.filter((output) => output.nodeId === LOOK_OUTPUT_NODE && isImage(output));
    if (stills.length === 0) throw new Error("The look step finished without images.");
    return stills;
  }

  // An object: one pass on the clip's first frame.
  async function runObjectLook(): Promise<{ jobId: string; picks: Output[] }> {
    if (!video) throw new Error("Add a video first.");
    const form = new FormData();
    form.set("mode", "object");
    form.set("video", video); form.set("start", String(start)); form.set("duration", String(clipLength));
    form.set("subject", thing.subject);
    form.set("direction", thing.description);
    if (thing.file) form.set("image", thing.file);
    form.set("candidates", String(LOOK_CANDIDATES));
    form.set("seed", String(seed));
    setMessage("Uploading…");
    const job = await follow(await submit("/api/look", form), `Replacing the ${subject} in the first frame`, LOOK_SECONDS);
    const stills = lookResult(job);
    setLookJobId(job.id); setCandidates(stills); setSelected(stills[0].id);
    return { jobId: job.id, picks: stills };
  }

  // A person: one pass that paints the character into the clip's first frame.
  async function runLook(): Promise<{ jobId: string; picks: Output[] }> {
    if (!video) throw new Error("Add a video first.");
    if (object) return runObjectLook();
    if (!person.file) throw new Error("Add a character image first.");
    const form = new FormData();
    form.set("video", video); form.set("start", String(start)); form.set("duration", String(clipLength));
    form.set("image", person.file);
    form.set("direction", person.description);
    form.set("candidates", String(LOOK_CANDIDATES));
    form.set("seed", String(seed));
    setMessage("Uploading…");
    const job = await follow(await submit("/api/look", form), "Painting your character into the first frame", LOOK_SECONDS);
    const stills = lookResult(job);
    setLookJobId(job.id); setCandidates(stills); setSelected(stills[0].id);
    return { jobId: job.id, picks: stills };
  }

  async function makeLooks() {
    if (!ready) return;
    cancelled.current = false; setError(false); setPhase("look"); resetLook();
    try {
      await runLook();
      setMessage("Pick the look you like on the right, then make the video in step 4.");
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "The look step failed.");
    } finally {
      setPhase("idle");
    }
  }

  async function makeVideo() {
    if (!ready || !clip || !video) return;
    cancelled.current = false; setError(false); setResult(null); setFinished(null);
    try {
      let lookId = lookJobId;
      let still = selected;
      if (useLook && !still) {
        setPhase("look");
        const look = await runLook();
        lookId = look.jobId; still = look.picks[0].id;
      }
      setPhase("video");
      // An object clip longer than 5 s is made in windows, each opening with the frame the one before redrew at
      // its start; the join puts them together. Everything else is one job.
      const windows = object ? objectWindows(clipLength) : [{ start: 0, duration: clipLength }];
      const parts: { start: number; jobId: string; outputId: string }[] = [];
      let handoff: { jobId: string; outputId: string } | null = null;
      for (const [k, part] of windows.entries()) {
        const next = windows[k + 1];
        const form = new FormData();
        form.set("video", video);
        form.set("start", String(start + part.start));
        form.set("duration", String(part.duration));
        form.set("seed", String(seed));
        form.set("mode", mode);
        form.set("engine", activeEngine);
        form.set("clipWidth", String(clip.width));
        form.set("clipHeight", String(clip.height));
        if (object) {
          form.set("subject", thing.subject);
          form.set("direction_0", thing.description);
          form.set("handoffSeconds", String(next ? Math.round((next.start - part.start) * 100) / 100 : 0));
        } else {
          form.set("direction_0", person.description);
        }
        if (handoff) { form.set("stillJobId", handoff.jobId); form.set("stillOutputId", handoff.outputId); }
        else if (useLook && lookId && still) { form.set("stillJobId", lookId); form.set("stillOutputId", still); }
        else if (object) { if (thing.file) form.set("image", thing.file); }
        else if (person.file) form.set("image", person.file);
        setMessage("Uploading…");
        const label = windows.length > 1 ? `Making the video, part ${k + 1} of ${windows.length}` : `Making the video (${ENGINES[activeEngine].choice.toLowerCase()})`;
        const job = await follow(await submit("/api/video", form), label, estimateSeconds(activeEngine, part.duration, 0));
        const output = job.outputs.find((candidate) => candidate.nodeId === ENGINES[activeEngine].outputNode && isVideo(candidate));
        if (!output) throw new Error("The video step finished without a video.");
        if (windows.length === 1) { setResult({ jobId: job.id, output, engine: activeEngine }); break; }
        parts.push({ start: part.start, jobId: job.id, outputId: output.id });
        if (next) {
          const frame = job.outputs.find((candidate) => candidate.nodeId === ENGINES[activeEngine].handoffNode && isImage(candidate));
          if (!frame) throw new Error(`Part ${k + 1} finished without the frame for the next part.`);
          handoff = { jobId: job.id, outputId: frame.id };
        }
      }
      if (parts.length) {
        const form = new FormData();
        form.set("video", video);
        form.set("start", String(start));
        form.set("duration", String(clipLength));
        form.set("parts", JSON.stringify(parts));
        const job = await follow(await submit("/api/join", form), `Joining the ${parts.length} parts`, JOIN_SECONDS_PER_CLIP_SECOND * clipLength + 10);
        const output = job.outputs.find((candidate) => candidate.nodeId === JOIN_OUTPUT_NODE && isVideo(candidate));
        if (!output) throw new Error("The join finished without a video.");
        setResult({ jobId: job.id, output, engine: activeEngine });
      }
      setMessage("Done. Compare, download, or upscale it.");
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "The video step failed.");
    } finally {
      setPhase("idle");
    }
  }

  async function upscale() {
    if (busy || !result) return;
    cancelled.current = false; setError(false); setPhase("finish");
    try {
      const form = new FormData();
      form.set("jobId", result.jobId); form.set("outputId", result.output.id); form.set("seed", String(seed));
      const job = await follow(await submit("/api/finish", form), "Upscaling", clipLength * 40);
      const output = job.outputs.find((candidate) => candidate.nodeId === FINISH_OUTPUT_NODE && isVideo(candidate));
      if (!output) throw new Error("The upscale finished without a video.");
      setFinished(output);
      setMessage("Upscaled version ready.");
    } catch (cause) {
      setError(true); setMessage(cause instanceof Error ? cause.message : "The upscale failed.");
    } finally {
      setPhase("idle");
    }
  }

  async function cancel() {
    cancelled.current = true;
    if (activeJob) await fetch(`/api/jobs/${activeJob}`, { method: "DELETE" }).catch(() => undefined);
    setActiveJob(null); setProgress(null);
  }

  function playBoth() {
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!before || !after) return;
    before.currentTime = start; after.currentTime = 0;
    void before.play(); void after.play();
  }

  const lookIndex = candidates.findIndex((output) => output.id === selected);

  return (
    <main className="shell">
      <header className="masthead">
        <p className="eyebrow">PERFORMANCE REMIX · COMFYUI · OPEN WEIGHTS</p>
        <h1>Swap anything in a clip: people, cars, products, clothes.</h1>
        <p className="lede">Keep the clip&apos;s motion, camera and sound, and change who or what is in it. Runs on your own GPU through ComfyUI.</p>
      </header>

      <section className="studio" aria-label="Performance Remix">
        <aside className="controls">
          <section className="step">
            <h2><span className="num">1</span>Video</h2>
            <label className={`drop${video ? " filled" : ""}`}>
              <input type="file" accept="video/mp4,video/quicktime" disabled={busy} onChange={(event) => chooseVideo(event.target.files?.[0])} />
              <span className="drop-title">{video ? video.name : "Upload video"}</span>
              <span className="drop-note">{clip ? `${clip.width}x${clip.height} · ${clip.duration.toFixed(1)} s` : `MP4 or MOV · up to ${maxSeconds} s is used`}</span>
            </label>
            {clip && (
              <>
                <p className="hint">
                  Uses {start.toFixed(1)}–{(start + clipLength).toFixed(1)} s
                  {start + clipLength < clip.duration - 0.05 ? ` of your ${clip.duration.toFixed(1)} s clip` : " of your clip"}
                  {cutByMachine ? ", the most this machine takes" : ""}.
                </p>
                <details className="advanced trim">
                  <summary>Trim the clip (optional)</summary>
                  <div className="range">
                    <label className="field"><span>Start · {start.toFixed(1)} s</span>
                      <input type="range" min={0} max={startMax} step={0.1} value={start} disabled={busy}
                        onChange={(event) => { const value = Number(event.target.value); setStart(value); setLength((current) => Math.min(current, Math.max(1, clip.duration - value))); resetLook(); }} />
                    </label>
                    <p className="hint">The look is painted into this frame, so start where the person or object is clearly in view.</p>
                    {minLength < maxLength && (
                      <>
                        <label className="field"><span>Length · {clipLength.toFixed(1)} s</span>
                          <input type="range" min={minLength} max={maxLength} step={0.1} value={clipLength} disabled={busy}
                            onChange={(event) => { setLength(Number(event.target.value)); setResult(null); setFinished(null); }} />
                        </label>
                        <p className="hint">Shorter clips render faster.</p>
                      </>
                    )}
                  </div>
                </details>
              </>
            )}
          </section>

          <section className="step">
            <h2><span className="num">2</span>What to swap</h2>
            <div className="choices two" role="radiogroup" aria-label="What to swap">
              {(["people", "object"] as const).map((option) => (
                <label key={option} className={`choice${mode === option ? " chosen" : ""}`}>
                  <input type="radio" name="mode" value={option} checked={mode === option} disabled={busy} onChange={() => chooseMode(option)} />
                  <span>{option === "people" ? "People" : "Object"}</span>
                </label>
              ))}
            </div>
            {object ? (
              <>
                <label className="field"><span>What to replace in the video</span>
                  <input type="text" value={thing.subject} maxLength={MAX_SUBJECT_LENGTH} disabled={busy} placeholder="the silver car"
                    onChange={(event) => updateThing({ subject: event.target.value })} />
                </label>
                <label className="field"><span>What it becomes (a few words are enough)</span>
                  <textarea value={thing.description} maxLength={MAX_DIRECTION_LENGTH} disabled={busy}
                    placeholder="e.g. a white 1970s camper van"
                    onChange={(event) => updateThing({ description: event.target.value })} />
                </label>
                <label className={`drop${thing.file ? " filled" : ""}`}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => chooseThingImage(event.target.files?.[0])} />
                  {thing.file ? <Thumb file={thing.file} /> : null}
                  <span className="drop-title">{thing.file ? thing.file.name : ownFrame ? "Add your edited first frame" : "Add an image of the new one (optional)"}</span>
                  <span className="drop-note">{ownFrame ? "The clip's first frame with the new one in place, same size" : "A car, a product, a jacket"}</span>
                </label>
                {frameProblem && <p className="hint problem">{frameProblem}</p>}
                <p className="hint">It may have another shape, like a van for a sedan. Clips over 5 s are made in 5-second parts, each starting from the one before.</p>
              </>
            ) : (
              <>
                <label className={`drop${person.file ? " filled" : ""}`}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => choosePersonImage(event.target.files?.[0])} />
                  {person.file ? <Thumb file={person.file} /> : null}
                  <span className="drop-title">{person.file ? person.file.name : "Add a character image"}</span>
                  <span className="drop-note">A painting, a photo or a drawing</span>
                </label>
                <label className="field"><span>Describe the character (recommended)</span>
                  <textarea value={person.description} maxLength={MAX_DIRECTION_LENGTH} disabled={busy}
                    placeholder="e.g. an old man with grey curly hair, a dark beret, no glasses"
                    onChange={(event) => updatePerson({ description: event.target.value })} />
                </label>
              </>
            )}
          </section>

          <section className={`step${useLook ? "" : " muted"}`}>
            <h2><span className="num">3</span>Look</h2>
            <p className="hint">
              {object
                ? ownFrame
                  ? `Download the first frame, put the new one in place of the ${subject || "object"} in any image editor without cropping it, and add it in step 2.`
                  : `The ${subject || "object"} is replaced in the first frame. Pick one of ${LOOK_CANDIDATES}.`
                : `Your character is painted into the first frame. Pick one of ${LOOK_CANDIDATES}.`}
            </p>
            {useLook && (
              <button type="button" disabled={!ready} onClick={() => void makeLooks()}>
                {phase === "look" ? "Making looks…" : candidates.length ? `Make ${LOOK_CANDIDATES} new looks` : `Make ${LOOK_CANDIDATES} looks`}
              </button>
            )}
            {useLook && lookIndex >= 0 && <p className="hint">Look {lookIndex + 1} is selected.</p>}
            {!object && (
              <label className="check">
                <input type="checkbox" checked={!fit} disabled={busy} onChange={(event) => { setFit(!event.target.checked); resetLook(); }} />
                <span>Skip: my image already matches the video&apos;s framing</span>
              </label>
            )}
            {object && (
              <label className="check">
                <input type="checkbox" checked={ownFrame} disabled={busy} onChange={(event) => chooseOwnFrame(event.target.checked)} />
                <span>Skip: I made the first frame myself</span>
              </label>
            )}
            {object && ownFrame && (
              <button type="button" className="ghost small" disabled={!video || busy} onClick={() => void downloadFirstFrame()}>Download first frame</button>
            )}
          </section>

          <section className="step">
            <h2><span className="num">4</span>Video</h2>
            {object ? (
              <div className="choices one">
                <p className="choice chosen" title={engineTip("object")}>
                  <span>{ENGINES.object.choice}</span>
                  <span className="info" aria-label={engineTip("object")}>ⓘ</span>
                </p>
              </div>
            ) : (
              <div className="choices two" role="radiogroup" aria-label="Quality">
                {PEOPLE_ENGINES.map((id) => (
                  <label key={id} className={`choice${engine === id ? " chosen" : ""}${fitProblem(id, device, clipLength) ? " unfit" : ""}`} title={engineTip(id)}>
                    <input type="radio" name="engine" value={id} checked={engine === id} disabled={busy} onChange={() => setEngine(id)} />
                    <span>{ENGINES[id].choice}</span>
                    <span className="info" aria-label={engineTip(id)}>ⓘ</span>
                  </label>
                ))}
              </div>
            )}
            {device && (
              <p className="hint">
                {device.gpu}, {device.vramGB} GB GPU, {device.ramGB} GB RAM: {object
                  ? (machineMax ? `object clips up to ${machineMax} s.` : "object swaps do not fit.")
                  : (machineMax ? `clips up to ${machineMax} s with any choice.` : "the people choices do not fit.")}
              </p>
            )}
            {tooLong && <p className="hint problem">{tooLong}</p>}
            <button type="button" className="primary" disabled={!ready} onClick={() => void makeVideo()}>{phase === "video" ? "Making video…" : "Make video"}</button>
            <p className="estimate">{video ? `About ${minutes(estimate)}${needsLook ? ", including the looks" : ""}.` : ""}</p>
          </section>

          {busy && <button type="button" className="ghost" onClick={() => void cancel()}>Cancel</button>}
          {progress !== null && <div className="bar" aria-hidden="true"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
          <p className={`status${error || frameProblem ? " error" : ""}`} role="status">
            {frameProblem && !busy ? "Step 2: use a first frame of the clip's size (see the note in step 2)." : message}
          </p>

          <details className="advanced">
            <summary>Advanced</summary>
            <label className="field"><span>Seed</span>
              <span className="seed-row">
                <input type="number" min={0} max={2147483647} value={seed} disabled={busy} onChange={(event) => { setSeed(Number(event.target.value) || 0); resetLook(); }} />
                <button type="button" disabled={busy} onClick={() => { setSeed(randomSeed()); resetLook(); }}>New</button>
              </span>
            </label>
          </details>
        </aside>

        <section className="stage" aria-label="Preview and results">
          {!videoUrl && (
            <div className="empty">
              <p className="empty-title">How it works</p>
              <ol>
                <li><b>Video:</b> a clip with one person or one object.</li>
                <li><b>What to swap:</b> the person (a character image) or the object (what it is and what it becomes).</li>
                <li><b>Look:</b> the change painted into the first frame. Pick one.</li>
                <li><b>Video:</b> that look moves with the clip&apos;s motion, camera and sound.</li>
              </ol>
            </div>
          )}

          {videoUrl && (
            <div className="block">
              <p className="block-title">{candidates.length ? "Pick a look" : "Your video"}</p>
              <div className="row">
                <figure className="tile">
                  <video ref={clipRef} src={videoUrl} controls muted playsInline />
                  <figcaption>Video</figcaption>
                </figure>
                {candidates.map((output, index) => (
                  <figure key={output.id} className="tile">
                    <button type="button" disabled={busy} className={`look${selected === output.id ? " picked" : ""}`}
                      onClick={() => { setSelected(output.id); setResult(null); setFinished(null); }}>
                      <img src={output.url} alt={`Look ${index + 1}`} />
                    </button>
                    <figcaption>{selected === output.id ? `Look ${index + 1} · selected` : `Look ${index + 1}`}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {result && videoUrl && (
            <div className="block">
              <p className="block-title">Result</p>
              <div className="row">
                <figure className="tile wide"><video ref={beforeRef} src={videoUrl} controls muted playsInline /><figcaption>Before</figcaption></figure>
                <figure className="tile wide"><video ref={afterRef} src={result.output.url} controls playsInline /><figcaption>After · {ENGINES[result.engine].choice}</figcaption></figure>
              </div>
              <div className="result-actions">
                <button type="button" onClick={playBoth}>Play both</button>
                <a className="button" href={result.output.url} download={result.output.name}>Download</a>
                <button type="button" disabled={busy} onClick={() => void upscale()} title="SeedVR2 upscale to 1.5x, about 40 s per second of video">{phase === "finish" ? "Upscaling…" : "Upscale 1.5×"}</button>
              </div>
            </div>
          )}

          {finished && (
            <div className="block">
              <p className="block-title">Upscaled</p>
              <div className="row"><figure className="tile wide"><video src={finished.url} controls playsInline /><figcaption>SeedVR2 1.5×</figcaption></figure></div>
              <div className="result-actions"><a className="button" href={finished.url} download={finished.name}>Download upscaled</a></div>
            </div>
          )}
        </section>
      </section>

      <footer className="foot">
        Runs on your own ComfyUI through comfy-api-proxy. Hover ⓘ for each option&apos;s engine and license. Label results as AI-generated.
      </footer>
    </main>
  );
}
