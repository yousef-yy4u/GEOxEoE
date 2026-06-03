import { pearson, ols, partial } from "@/lib/stats";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { x?: number[]; y?: number[]; z?: number[] };
  const { x, y, z } = body;
  if (!x || !y || x.length !== y.length) {
    return Response.json({ error: "x and y must be equal-length arrays" }, { status: 400 });
  }
  const out: Record<string, unknown> = { pearson: pearson(x, y), ols: ols(x, y) };
  if (z && z.length === x.length) out.partial = partial(x, y, z);
  return Response.json(out);
}
