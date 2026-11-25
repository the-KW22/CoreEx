"use server";

import { headers } from "next/headers";

import { publicApiClient } from "@/lib/api/client";
import { requestAccessError, visitorAddress } from "@/lib/request-access";

export type RequestAccessState = { status: "sent" } | { status: "error"; message: string; email: string } | undefined;

// The public Request access form: no sign-in. The API gives the same answer whether or not the email was new.
export async function requestAccess(_previous: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  const email = String(formData.get("email") ?? "").trim();
  const visitor = visitorAddress((await headers()).get("x-forwarded-for"));
  const result = await publicApiClient()
    .POST("/api/access-requests", { body: { email }, params: { header: { "X-Visitor-IP": visitor } } })
    .catch(() => null);
  if (result?.response.ok) return { status: "sent" };
  return { status: "error", email, message: requestAccessError(result?.response.status, result?.error?.message) };
}
