import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-context";

const KEY_PREFIX = "tcrm_menu_hidden_v1_";

function loadHidden(userKey: string): string[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userKey);
    if (raw) return JSON.parse(raw);
  } catch {
    /* */
  }
  return [];
}

function saveHidden(userKey: string, list: string[]) {
  try {
    localStorage.setItem(KEY_PREFIX + userKey, JSON.stringify(list));
  } catch {
    /* */
  }
  // Aynı sekmede dinleyenleri uyandır
  window.dispatchEvent(new CustomEvent("tcrm:menu-prefs-changed"));
}

export function useMenuPrefs() {
  const { user } = useAuth();
  const userKey = user ? `u${user.id}` : "anon";
  const [hidden, setHidden] = useState<string[]>(() => loadHidden(userKey));

  useEffect(() => {
    setHidden(loadHidden(userKey));
    function onChange() {
      setHidden(loadHidden(userKey));
    }
    window.addEventListener("tcrm:menu-prefs-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("tcrm:menu-prefs-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [userKey]);

  const isHidden = useCallback((href: string) => hidden.includes(href), [hidden]);

  const toggle = useCallback(
    (href: string) => {
      const next = hidden.includes(href) ? hidden.filter((h) => h !== href) : [...hidden, href];
      setHidden(next);
      saveHidden(userKey, next);
    },
    [hidden, userKey],
  );

  const setMany = useCallback(
    (next: string[]) => {
      setHidden(next);
      saveHidden(userKey, next);
    },
    [userKey],
  );

  return { hidden, isHidden, toggle, setMany };
}
