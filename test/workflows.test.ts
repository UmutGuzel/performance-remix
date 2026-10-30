import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ENGINES, FINISH_WORKFLOW, JOIN_WORKFLOW, LOOK_WORKFLOW, dropReference, hideOldObject, type InputRef } from "../lib/engines.ts";

type ApiNode = { class_type: string; inputs: Record<string, unknown> };

const API_DIR = join(import.meta.dirname, "..", "workflows", "api");

function load(file: string): Record<string, ApiNode> {
  return JSON.parse(readFileSync(join(API_DIR, file), "utf8"));
}

function assertNoDanglingLinks(name: string, nodes: Record<string, ApiNode>) {
  for (const [id, entry] of Object.entries(nodes)) {
    for (const [field, value] of Object.entries(entry.inputs)) {
      if (Array.isArray(value) && typeof value[0] === "string") {
        assert.ok(nodes[value[0]], `${name}: node ${id}.${field} links to missing node ${value[0]}`);
      }
    }
  }
}

function linkedClass(nodes: Record<string, ApiNode>, node: ApiNode, field: string): string | undefined {
  const value = node.inputs[field];
  return Array.isArray(value) ? nodes[value[0] as string]?.class_type : undefined;
}

function assertInputs(file: string, refs: Record<string, InputRef | undefined>) {
  const graph = load(file);
  for (const [name, ref] of Object.entries(refs)) {
    if (!ref) continue;
    const [node, field] = ref;
    assert.ok(graph[node], `${file}: "${name}" points at node ${node}, which does not exist`);
    assert.ok(field in graph[node].inputs, `${file}: "${name}" points at ${graph[node].class_type} ${node}.${field}, which has no such input`);
  }
  return graph;
}

test("every input the app sets exists in its workflow file", () => {
  assertInputs(LOOK_WORKFLOW.file, LOOK_WORKFLOW.inputs);
  assertInputs(FINISH_WORKFLOW.file, FINISH_WORKFLOW.inputs);
  assertInputs(JOIN_WORKFLOW.file, JOIN_WORKFLOW.inputs);
  for (const engine of Object.values(ENGINES)) assertInputs(engine.workflow, engine.inputs);
});

test("output nodes save the files the app reads", () => {
  assert.equal(load(LOOK_WORKFLOW.file)[LOOK_WORKFLOW.outputNode].class_type, "SaveImage");
  assert.equal(load(FINISH_WORKFLOW.file)[FINISH_WORKFLOW.outputNode].class_type, "PerformanceRemixStreamingFinish");
  assert.equal(load(JOIN_WORKFLOW.file)[JOIN_WORKFLOW.outputNode].class_type, "PerformanceRemixJoinWindows");
  for (const engine of Object.values(ENGINES)) assert.equal(load(engine.workflow)[engine.outputNode].class_type, "SaveVideo");
  assert.equal(load(ENGINES.object.workflow)[ENGINES.object.handoffNode ?? ""].class_type, "SaveImage");
});

test("the join workflow loads one window per join input, on the clip range", () => {
  const nodes = load(JOIN_WORKFLOW.file);
  const joinNode = nodes[JOIN_WORKFLOW.outputNode];
  assert.deepEqual(joinNode.inputs.video, [JOIN_WORKFLOW.inputs.start[0], 0]);
  assert.equal(nodes[JOIN_WORKFLOW.inputs.start[0]].class_type, "Video Slice");
  assert.deepEqual(nodes[JOIN_WORKFLOW.inputs.start[0]].inputs.video, [JOIN_WORKFLOW.inputs.video[0], 0]);
  for (const [k, id] of JOIN_WORKFLOW.windows.entries()) {
    assert.equal(nodes[id].class_type, "LoadVideo");
    assert.deepEqual(joinNode.inputs[`window_${k + 1}`], [id, 0]);
  }
});

test("no workflow links to a missing node", () => {
  const files = readdirSync(API_DIR).filter((file) => file.endsWith(".api.json"));
  assert.equal(files.length, 8);
  for (const file of files) assertNoDanglingLinks(file, load(file));
});

test("Best for animals is Fast without the speed LoRAs, at 20 steps", () => {
  const fast = load(ENGINES.fun.workflow);
  const detail = load(ENGINES.detail.workflow);
  const loras = (nodes: Record<string, ApiNode>) => Object.keys(nodes).filter((id) => nodes[id].class_type === "LoraLoaderModelOnly");
  const [long] = Object.values(detail).filter((n) => n.class_type === "PerformanceRemixFunControlLong");
  for (const field of ["model_high_noise", "model_low_noise"]) {
    const sampling = detail[(long.inputs[field] as [string, number])[0]];
    assert.equal(sampling.class_type, "ModelSamplingSD3");
    assert.equal(linkedClass(detail, sampling, "model"), "UNETLoader");
  }
  assert.deepEqual([long.inputs.steps, long.inputs.switch_step, long.inputs.cfg], [20, 10, 3.5]);
  // the same graph otherwise: only the two Fun Control LoRAs are gone (the face pass keeps its own)
  const speed = loras(fast).filter((id) => !loras(detail).includes(id));
  assert.equal(speed.length, 2);
  assert.deepEqual(Object.keys(detail).sort(), Object.keys(fast).filter((id) => !speed.includes(id)).sort());
});

test("stage 2 decodes the clip at the working size, never at full size", () => {
  const sizes: Record<string, [string, number]> = { viggle: ["width x height", 704], fun: ["shorter side", 720], detail: ["shorter side", 720], scail2: ["width x height", 704], object: ["shorter side", 1024] };
  for (const engine of Object.values(ENGINES)) {
    const nodes = load(engine.workflow);
    assert.ok(!Object.values(nodes).some((n) => n.class_type === "GetVideoComponents"), engine.id);
    const decode = Object.values(nodes).filter((n) => n.class_type === "PerformanceRemixClipFrames");
    assert.equal(decode.length, 1, engine.id);
    const [mode, size] = sizes[engine.id];
    assert.equal(decode[0].inputs.size, mode, engine.id);
    assert.equal(mode === "shorter side" ? decode[0].inputs.shorter_side : decode[0].inputs.width, size, engine.id);
  }
  // Viggle's conditioning reads its size from the decode node, so the app sets it in one place
  const viggle = load(ENGINES.viggle.workflow);
  assert.deepEqual([viggle["12"].inputs.width, viggle["12"].inputs.height], [["5", 3], ["5", 4]]);
});

test("an object described in words only drops the reference image", () => {
  const graph = load(LOOK_WORKFLOW.file) as Record<string, unknown>;
  dropReference(graph);
  const nodes = graph as Record<string, ApiNode>;
  const { node, users, field } = LOOK_WORKFLOW.reference;
  assert.equal(nodes[node], undefined);
  for (const id of users) {
    assert.equal(nodes[id].class_type, "TextEncodeQwenImageEditPlus");
    assert.ok(!(field in nodes[id].inputs));
    assert.ok("image1" in nodes[id].inputs);
  }
  assertNoDanglingLinks("look, no reference", nodes);
  for (const key of ["video", "start", "candidates", "prompt", "seed"] as const) {
    const [ref, input] = LOOK_WORKFLOW.inputs[key];
    assert.ok(input in nodes[ref].inputs);
  }
  assert.throws(() => dropReference(graph), /no input/);
});

test("an object look hides the old object from the edit model behind a gray shape", () => {
  const graph = load(LOOK_WORKFLOW.file) as Record<string, unknown>;
  hideOldObject(graph, "the silver sedan.");
  dropReference(graph); // words only: both changes together
  const nodes = graph as Record<string, ApiNode>;
  const { frame, target, subjectNode } = LOOK_WORKFLOW.hideObject;
  assert.equal(nodes[subjectNode].inputs.text, "silver sedan");
  const [composite] = Object.values(nodes).filter((n) => n.class_type === "ImageCompositeMasked");
  assert.deepEqual(composite.inputs.destination, [...frame]);
  assert.equal(linkedClass(nodes, composite, "mask"), "GrowMask");
  assert.equal(linkedClass(nodes, composite, "source"), "MaskToImage");
  const [detect] = Object.values(nodes).filter((n) => n.class_type === "SAM3_Detect");
  assert.deepEqual(detect.inputs.image, [...frame]);
  assert.equal(linkedClass(nodes, nodes[target[0]], target[1]), "ImageCompositeMasked");
  assertNoDanglingLinks("look, object", nodes);
  for (const key of ["video", "start", "candidates", "prompt", "seed"] as const) {
    const [ref, input] = LOOK_WORKFLOW.inputs[key];
    assert.ok(input in nodes[ref].inputs);
  }
  assert.throws(() => hideOldObject(graph, "car"), /already exists/);
});

test("the object engine: old object tracked in the clip, new one found in the look and the redraw", () => {
  const nodes = load(ENGINES.object.workflow);
  const { subject, newSubject, still, video, start } = ENGINES.object.inputs;
  const byClass = (type: string) => Object.entries(nodes).filter(([, entry]) => entry.class_type === type);
  const trackers = byClass("SAM3_VideoTrack");
  assert.equal(trackers.length, 4);
  const [[oldId, oldTracker]] = trackers.filter(([, tracker]) => (tracker.inputs.conditioning as string[])[0] === subject?.[0]);
  const [[, newTracker]] = trackers.filter(([, tracker]) => (tracker.inputs.conditioning as string[])[0] === newSubject?.[0]);
  assert.equal(oldTracker.inputs.max_objects, 1);
  assert.equal(newTracker.inputs.max_objects, 1);

  // heads and faces stay the clip's: the area and the paste-back get the same keep mask
  const heads = trackers.filter(([, tracker]) => ["head", "face"].includes(String(nodes[(tracker.inputs.conditioning as string[])[0]].inputs.text)));
  assert.equal(heads.length, 2);
  for (const [, tracker] of heads) assert.deepEqual(tracker.inputs.images, ["5408:5384", 0]);
  const [[keepId, keep]] = byClass("MaskComposite");
  assert.equal(keep.inputs.operation, "or");
  assert.equal(linkedClass(nodes, newTracker, "images"), "LTXVLaplacianPyramidBlend");
  const [[, detect]] = byClass("SAM3_Detect");
  assert.deepEqual(detect.inputs.conditioning, [newSubject?.[0], 0]);

  // the redraw area: the old mask widened to fit the new object in the look
  const [[areaId, area]] = byClass("PerformanceRemixObjectArea");
  assert.equal(linkedClass(nodes, area, "masks"), "SAM3_TrackToMask");
  assert.deepEqual(nodes[(area.inputs.masks as string[])[0]].inputs.track_data, [oldId, 0]);
  assert.equal(linkedClass(nodes, area, "look_mask"), "SAM3_Detect");
  assert.deepEqual(area.inputs.keep, [keepId, 0]);
  assert.deepEqual(nodes["5408:5377"].inputs.image, [Object.entries(nodes).find(([, n]) => n.class_type === "MaskToImage" && (n.inputs.mask as string[])[0] === areaId)?.[0], 0]);

  // the opening frame is the clip's first frame with the look inside the area
  const [[, opening]] = byClass("ImageCompositeMasked");
  assert.equal(linkedClass(nodes, opening, "source"), "ResizeImageMaskNode");
  assert.deepEqual(nodes[(opening.inputs.source as string[])[0]].inputs.input, [still[0], 0]);
  assert.equal(linkedClass(nodes, opening, "destination"), "ImageFromBatch");

  // the clip range is cut, then padded to at least 145 frames and an 8k+1 count, before any scaling
  assert.equal(nodes[start[0]].class_type, "Video Slice");
  assert.deepEqual(nodes[start[0]].inputs.video, [video[0], 0]);
  assert.equal(linkedClass(nodes, nodes["5408:5399"], "input"), "PerformanceRemixPadFrames");
  const padId = (nodes["5408:5399"].inputs.input as string[])[0];
  assert.equal(nodes[padId].inputs.min_frames, 145);

  // the result: the clip outside the old and the new object, with the shadow-aware widening
  const [[pasteId, paste]] = byClass("PerformanceRemixPasteObject");
  assert.deepEqual(paste.inputs.masks_old, area.inputs.masks);
  assert.deepEqual(paste.inputs.original, ["5408:5371", 0]);
  assert.ok(Number(paste.inputs.shadow_reach) > 0);
  assert.deepEqual(paste.inputs.keep, [keepId, 0]);
  assert.equal(linkedClass(nodes, paste, "masks_new"), "SAM3_TrackToMask");
  assert.deepEqual(oldTracker.inputs.images, ["5408:5384", 0]);
  // cut back to the clip's own frame count; that frame at `handoff` seconds is saved for the next window
  const [[, create]] = byClass("CreateVideo");
  const cutId = (create.inputs.images as string[])[0];
  assert.equal(nodes[cutId].class_type, "ImageFromBatch");
  assert.deepEqual(nodes[cutId].inputs.image, [pasteId, 0]);
  assert.deepEqual(nodes[cutId].inputs.length, [padId, 1]);
  const [frameId] = ENGINES.object.inputs.handoff ?? [""];
  assert.equal(nodes[frameId].class_type, "PerformanceRemixFrameAt");
  assert.deepEqual(nodes[frameId].inputs.images, [cutId, 0]);
  assert.deepEqual(nodes[ENGINES.object.handoffNode ?? ""].inputs.images, [frameId, 0]);
  assert.deepEqual(nodes[ENGINES.object.outputNode].inputs.video, [Object.entries(nodes).find(([, n]) => n === create)?.[0], 0]);
});
