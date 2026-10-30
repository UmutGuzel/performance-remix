import { submitFinish } from "../../../lib/comfy";
import { errorResponse, requiredText, seed } from "../../../lib/form";

export const runtime = "nodejs";

// Finish: SeedVR2 upscale (1.5x, no extra sharpening) of a stage 2 result.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const job = await submitFinish({ jobId: requiredText(form, "jobId"), outputId: requiredText(form, "outputId"), seed: seed(form) });
    return Response.json(job, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
