import { submitLook, submitObjectLook } from "../../../lib/comfy";
import { LOOK_CANDIDATES } from "../../../lib/engines";
import {
  clipRange,
  direction,
  errorResponse,
  imageFile,
  intInRange,
  optionalImageFile,
  requiredDirection,
  seed,
  subject,
  swapMode,
  videoFile,
} from "../../../lib/form";

export const runtime = "nodejs";

// Stage 1. People: paints the character into the clip's first frame. Object: replaces one thing in the first
// frame, from a short name and an optional image.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const candidates = intInRange(form, "candidates", 1, LOOK_CANDIDATES, LOOK_CANDIDATES);
    if (swapMode(form) === "object") {
      const job = await submitObjectLook({
        video: videoFile(form),
        range: clipRange(form),
        image: optionalImageFile(form, "image"),
        subject: subject(form),
        description: requiredDirection(form),
        candidates,
        seed: seed(form),
      });
      return Response.json(job, { status: 202 });
    }
    const job = await submitLook({
      video: videoFile(form),
      range: clipRange(form),
      image: imageFile(form, "image"),
      description: direction(form),
      candidates,
      seed: seed(form),
    });
    return Response.json(job, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
