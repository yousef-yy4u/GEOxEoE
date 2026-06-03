import { addAnnotation, listAnnotations } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const region = new URL(req.url).searchParams.get("region") ?? undefined;
  return Response.json(listAnnotations(region));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { region?: string; body?: string; author?: string };
  const region = (body.region ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!region || !text) {
    return Response.json({ error: "region and body are required" }, { status: 400 });
  }
  return Response.json(addAnnotation(region, text, body.author ?? null));
}
