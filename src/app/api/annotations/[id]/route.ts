import { deleteAnnotation } from "@/lib/store";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!deleteAnnotation(Number(id))) {
    return Response.json({ error: "annotation not found" }, { status: 404 });
  }
  return Response.json({ deleted: true });
}
