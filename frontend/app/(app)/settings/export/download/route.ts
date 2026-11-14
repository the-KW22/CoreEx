import { redirect } from "next/navigation";

import { getApi } from "@/lib/api/server";

// The zip is made by the API; this only passes it on, as it arrives, with the signed-in User's session, so the
// browser can save it by following a link. A refusal or failure sends the User back to the Export page with why.
export async function GET() {
  const api = await getApi();
  const result = await api.GET("/api/export", { parseAs: "stream" }).catch(() => null);
  if (!result?.response.ok || !result.data) {
    redirect(`/settings/export?error=${result?.response.status === 429 ? "wait" : "failed"}`);
  }
  return new Response(result.data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": result.response.headers.get("content-disposition") ?? 'attachment; filename="coreex-export.zip"',
      "Cache-Control": "no-store",
    },
  });
}
