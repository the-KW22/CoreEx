"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Tells the server the browser's timezone, which the API needs to say what is due now. It sets the `tz` cookie when
// it is missing or has changed, and refreshes the page once so that page is worked out in the right zone.
export function TimezoneCookie() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || document.cookie.split("; ").includes(`tz=${zone}`)) return;
    document.cookie = `tz=${zone}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
