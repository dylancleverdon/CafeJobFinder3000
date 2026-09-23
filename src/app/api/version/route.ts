// The phone app polls this to know when a new version has been deployed.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev", builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
