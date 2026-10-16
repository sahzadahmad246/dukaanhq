"use client";

import { useCallback, useEffect, useState } from "react";

// Session storage survives a browser discarding a background tab, and is isolated
// from other tabs. Scope it to the current shop and page.
export function useBillFormSession() {
  const [open, setOpen] = useState(false);
  const [resumeDraft, setResumeDraft] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (sessionStorage.getItem(`bill-form:${location.pathname}${location.search}`) === "open") {
          setResumeDraft(true);
          setOpen(true);
        }
      } catch {
        // Storage can be disabled by the browser.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setFormOpen = useCallback((nextOpen: boolean) => {
    setResumeDraft(false);
    setOpen(nextOpen);
    try {
      const key = `bill-form:${location.pathname}${location.search}`;
      if (nextOpen) sessionStorage.setItem(key, "open");
      else sessionStorage.removeItem(key);
    } catch {
      // In-memory form state still works without storage.
    }
  }, []);

  return [open, setFormOpen, resumeDraft] as const;
}
