export const dynamic = "force-dynamic";

export function GET() {
  // Liveness deliberately stays independent of Catalog and session availability.
  return Response.json({ status: "live" }, { headers: { "cache-control": "no-store" } });
}
