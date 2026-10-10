"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the page's server data every `seconds` while the tab is visible, and as soon as it
 * becomes visible again (e.g. an organiser unlocks their phone). Only for pages without forms,
 * so it never interrupts typing.
 */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(refreshIfVisible, seconds * 1000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router, seconds]);
  return null;
}
