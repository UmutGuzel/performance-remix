import { cancelJob, getJob } from "../../../../lib/comfy";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json(await getJob(id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not check the job." }, { status: 502 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json(await cancelJob(id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not cancel the job." }, { status: 502 });
  }
}
