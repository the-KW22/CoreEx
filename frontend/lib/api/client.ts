import createClient from "openapi-fetch";

import type { paths } from "./schema";

// Server-side only (no NEXT_PUBLIC_): the browser never sees the API address.
// `timezone` is the User's own (a zone name like Asia/Tokyo): the API works out "due" and times in it.
export function apiClient(accessToken: string, timezone?: string) {
  return createClient<paths>({
    baseUrl: process.env.API_URL ?? "http://localhost:8080",
    headers: { Authorization: `Bearer ${accessToken}`, ...(timezone ? { "X-Timezone": timezone } : {}) },
  });
}
