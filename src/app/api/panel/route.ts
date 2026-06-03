import { getPanel } from "@/lib/panel-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getPanel());
}
