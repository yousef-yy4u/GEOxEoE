import { saveView } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const state = await req.json();
  return Response.json({ id: saveView(state) });
}
