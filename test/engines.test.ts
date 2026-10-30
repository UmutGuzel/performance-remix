import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  JOIN_WORKFLOW,
  MAX_CLIP_SECONDS,
  MAX_OBJECT_SECONDS,
  PEOPLE_ENGINES,
  estimateSeconds,
  objectWindows,
  frameShapeError,
  isEngineId,
  isSwapMode,
  lookPrompt,
  motionPrompt,
  newSubjectPhrase,
  objectLookPrompt,
  objectMotionPrompt,
  outputSize,
  subjectPhrase,
} from "../lib/engines.ts";

test("output size keeps 9:16 at the tested 704x1248", () => {
  assert.deepEqual(outputSize(1080, 1920), { width: 704, height: 1248 });
  assert.deepEqual(outputSize(720, 1280), { width: 704, height: 1248 });
});

test("output size follows other aspect ratios in multiples of 32", () => {
  const wide = outputSize(1920, 1080);
  assert.deepEqual(wide, { width: 1248, height: 704 });
  const square = outputSize(1000, 1000);
  assert.equal(square.width, square.height);
  for (const size of [wide, square, outputSize(1440, 1080)]) {
    assert.equal(size.width % 32, 0);
    assert.equal(size.height % 32, 0);
  }
});

test("output size falls back to 9:16 for missing dimensions", () => {
  assert.deepEqual(outputSize(0, 0), { width: 704, height: 1248 });
});

test("prompts add the character description", () => {
  assert.ok(lookPrompt("").startsWith("Remove the person in image 1 completely"));
  assert.ok(!lookPrompt("").includes("The person from image 2:"));
  assert.ok(lookPrompt("  an old man with a beret ").endsWith("The person from image 2: an old man with a beret"));
  assert.ok(motionPrompt("an old man").startsWith("The character (an old man) performs"));
  assert.ok(motionPrompt(" ").startsWith("The character from the reference image performs"));
});

test("engine ids and estimates", () => {
  assert.ok(isEngineId("viggle") && isEngineId("fun") && isEngineId("detail") && isEngineId("scail2") && isEngineId("object"));
  assert.ok(!isEngineId("ltx"));
  assert.equal(estimateSeconds("fun", 10, 0), 500);
  assert.equal(estimateSeconds("fun", 10, 1), 540);
  assert.equal(estimateSeconds("detail", 5, 0), 1900);
  // every object window is padded to 5 s; two windows add the join
  assert.equal(estimateSeconds("object", 1, 0), 425);
  assert.equal(estimateSeconds("object", 4, 1), 465);
  assert.equal(estimateSeconds("object", 6, 0), 2 * 425 + 12);
});

test("a long object clip is made of 5 s windows 4.5 s apart, the last one at least 1 s", () => {
  assert.deepEqual(objectWindows(1), [{ start: 0, duration: 1 }]);
  assert.deepEqual(objectWindows(5), [{ start: 0, duration: 5 }]);
  assert.deepEqual(objectWindows(6), [{ start: 0, duration: 5 }, { start: 4.5, duration: 1.5 }]);
  assert.deepEqual(objectWindows(9.5), [{ start: 0, duration: 5 }, { start: 4.5, duration: 5 }]);
  assert.deepEqual(objectWindows(9.6), [{ start: 0, duration: 5 }, { start: 4.5, duration: 5 }, { start: 8.6, duration: 1 }]);
  for (let tenths = 10; tenths <= MAX_CLIP_SECONDS * 10; tenths++) {
    const seconds = tenths / 10;
    const windows = objectWindows(seconds);
    assert.ok(windows.length <= JOIN_WORKFLOW.windows.length, `${seconds} s: ${windows.length} windows`);
    assert.equal(windows[0].start, 0);
    const last = windows[windows.length - 1];
    assert.ok(Math.abs(last.start + last.duration - seconds) < 1e-9, `${seconds} s ends at ${last.start + last.duration}`);
    for (const [k, w] of windows.entries()) {
      assert.ok(w.duration >= 1 && w.duration <= MAX_OBJECT_SECONDS, `${seconds} s window ${k}`);
      // each join has at least 0.5 s that both windows cover
      if (k) assert.ok(windows[k - 1].start + windows[k - 1].duration - w.start >= 0.5 - 1e-9 && w.start > windows[k - 1].start, `${seconds} s join ${k}`);
    }
  }
});

test("the People choice offers only the person engines", () => {
  assert.deepEqual(PEOPLE_ENGINES, ["viggle", "fun", "detail", "scail2"]);
  assert.ok(isSwapMode("people") && isSwapMode("object"));
  assert.ok(!isSwapMode("animal") && !isSwapMode(null));
});

test("one object job is a window, shorter than a people clip", () => {
  assert.ok(MAX_OBJECT_SECONDS >= 1 && MAX_OBJECT_SECONDS < MAX_CLIP_SECONDS);
});

test("an own first frame must have the clip's shape", () => {
  const clip = { width: 1080, height: 1920 };
  assert.equal(frameShapeError({ width: 1080, height: 1920 }, clip), null);
  assert.equal(frameShapeError({ width: 540, height: 960 }, clip), null); // scaled, same shape
  assert.equal(frameShapeError({ width: 1024, height: 1792 }, clip), null); // 1.6% off: within 2%
  assert.match(frameShapeError({ width: 1080, height: 1080 }, clip) ?? "", /1080x1080 and the clip is 1080x1920/);
  assert.ok(frameShapeError({ width: 1392, height: 752 }, { width: 1920, height: 1080 })); // a 1.85:1 still for a 16:9 clip: 4% off
  assert.ok(frameShapeError({ width: 0, height: 10 }, clip));
});

test("what to replace becomes a short noun phrase", () => {
  assert.equal(subjectPhrase("the silver car."), "silver car");
  assert.equal(subjectPhrase("  A   red  jacket "), "red jacket");
  assert.equal(subjectPhrase("an amber bottle!"), "amber bottle");
  assert.equal(subjectPhrase("bottle"), "bottle");
  assert.equal(subjectPhrase("the "), "");
  assert.equal(subjectPhrase("theater seat"), "theater seat");
});

test("object prompts name the thing and keep everything else", () => {
  const withImage = objectLookPrompt("the silver car", "a dark green 1970s sedan", true);
  assert.ok(withImage.startsWith("In image 1 a flat gray shape covers the silver car. Replace the gray shape with the one shown in image 2: a dark green 1970s sedan."));
  assert.ok(withImage.includes("same position, size in frame and angle"));
  assert.ok(withImage.includes("add no people"));
  assert.ok(!withImage.includes("outline"));
  assert.ok(withImage.endsWith("the people, faces, hands, background and light."));
  assert.ok(objectLookPrompt("jacket", " a red leather jacket ", false).includes("Replace the gray shape with a red leather jacket."));
  assert.ok(!objectLookPrompt("jacket", "a red leather jacket", false).includes("image 2"));
});

test("the object video prompt uses the tested LTX wording", () => {
  assert.equal(objectMotionPrompt("the car", " a yellow 1990s pickup truck, no badges or stickers. "),
    "a yellow 1990s pickup truck, no badges or stickers. The same scene, camera and light as the rest of the video.");
  assert.equal(objectMotionPrompt("car", " "), "the new car from the reference image. The same scene, camera and light as the rest of the video.");
});

test("the new object's name for SAM 3 is the head of its description", () => {
  assert.equal(newSubjectPhrase("a white 1970s camper van with a tall boxy body, no badges", "car"), "white 1970s camper van");
  assert.equal(newSubjectPhrase("A yellow 1990s pickup truck, no badges or stickers", "car"), "yellow 1990s pickup truck");
  assert.equal(newSubjectPhrase("a yellow rubber duck.", "bottle"), "yellow rubber duck");
  assert.equal(newSubjectPhrase("a long camel trench coat with a belt", "jacket"), "long camel trench coat");
  assert.equal(newSubjectPhrase("a very long shiny dark green metallic 1970s American family sedan", "car"), "very long shiny dark green metallic 1970s American");
  assert.equal(newSubjectPhrase(", no badges", "the silver car"), "silver car");
});
