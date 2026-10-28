import createClient from "openapi-fetch";

import type { paths } from "./schema";

// Server-side only (no NEXT_PUBLIC_): the browser never sees the API address.
export function apiClient(accessToken: string) {
  return createClient<paths>({
    baseUrl: process.env.API_URL ?? "http://localhost:8080",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
