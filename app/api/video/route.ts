import { submitVideo, type StillSource } from "../../../lib/comfy";
import { engineCap, fitProblem } from "../../../lib/device";
import { readDevice } from "../../../lib/device-stats";
import { MAX_OBJECT_SECONDS, frameShapeError, isEngineId } from "../../../lib/engines";
import { imageSize } from "../../../lib/image-size";
import {
  InputError,
  clipRange,
  direction,
  errorResponse,
  imageFile,
  optionalSeconds,
  positiveNumber,
  requiredDirection,
  requiredText,
  seed,
  subject,
  swapMode,
  videoFile,
} from "../../../lib/form";

export const runtime = "nodejs";

// Stage 2: the approved still (a stage 1 candidate) or the user's own image, animated with the clip.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const engine = form.get("engine");
    if (!isEngineId(engine)) throw new InputError("Choose an engine.");
    const object = swapMode(form) === "object";
    if (object !== (engine === "object")) {
      throw new InputError(object ? "An object swap uses the object engine." : "Choose a quality for people.");
    }
    const clipWidth = positiveNumber(form, "clipWidth");
    const clipHeight = positiveNumber(form, "clipHeight");
    // the engine's fixed cap first, then what fits the machine ComfyUI runs on
    const range = clipRange(form, engineCap(engine));
    const tooLong = fitProblem(engine, await readDevice(), range.duration);
    if (tooLong) throw new InputError(tooLong);
    let still: StillSource;
    if (form.get("stillJobId")) {
      still = { kind: "output", jobId: requiredText(form, "stillJobId"), outputId: requiredText(form, "stillOutputId") };
    } else if (object) {
      // Skip: the user's own first frame, with the new object already in place, opens the video.
      const frame = imageFile(form, "image", "Make the looks first, or tick Skip and add your edited first frame.");
      const size = imageSize(new Uint8Array(await frame.arrayBuffer()));
      if (!size) throw new InputError("Could not read the frame's size. Use a PNG, JPEG or WebP image.");
      const problem = frameShapeError(size, { width: clipWidth, height: clipHeight });
      if (problem) throw new InputError(problem);
      still = { kind: "upload", file: frame };
    } else {
      still = { kind: "upload", file: imageFile(form, "image") };
    }
    const job = await submitVideo({
      engine,
      video: videoFile(form),
      still,
      range,
      clipWidth,
      clipHeight,
      description: object ? requiredDirection(form, "direction_0") : direction(form, "direction_0"),
      subject: object ? subject(form) : undefined,
      // a window of a long object clip: when the next window starts, from this window's start
      handoffSeconds: object ? optionalSeconds(form, "handoffSeconds", MAX_OBJECT_SECONDS) : undefined,
      seed: seed(form),
    });
    return Response.json(job, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
