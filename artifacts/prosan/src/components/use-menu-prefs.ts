import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth-context";

// v2: artık href değil, stabil item id (navItemId helper) saklanıyor.
// Eski v1 kayıtları bir kerelik göz ardı edilir (kullanıcılar tercihlerini sıfırlanmış görür).
const KEY_PREFIX = "tcrm_menu_hidden_v2_";

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

  const isHidden = useCallback((id: string) => hidden.includes(id), [hidden]);

  const toggle = useCallback(
    (id: string) => {
      const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
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
