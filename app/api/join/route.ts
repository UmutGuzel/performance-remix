import { submitJoin } from "../../../lib/comfy";
import { JOIN_WORKFLOW, MAX_CLIP_SECONDS } from "../../../lib/engines";
import { clipRange, errorResponse, videoFile, windowParts } from "../../../lib/form";

export const runtime = "nodejs";

// A long object clip: the 5 s windows made one after another, joined on the clip's frame times with its audio.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const job = await submitJoin({
      video: videoFile(form),
      range: clipRange(form, MAX_CLIP_SECONDS),
      parts: windowParts(form, JOIN_WORKFLOW.windows.length),
    });
    return Response.json(job, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
