import { getView } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = getView(id);
  if (view === null) return Response.json({ error: "view not found" }, { status: 404 });
  return Response.json(view);
}
