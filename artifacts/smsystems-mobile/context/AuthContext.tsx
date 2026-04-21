import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COOKIE_KEY = "smsystems_cookies";
const USER_KEY = "smsystems_user";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080/api";
const TENANT = process.env.EXPO_PUBLIC_TENANT ?? "prosan";

interface User {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  apiGet: <T>(path: string) => Promise<T>;
  apiPost: <T>(path: string, body: unknown) => Promise<T>;
  apiPatch: <T>(path: string, body: unknown) => Promise<T>;
  apiPut: <T>(path: string, body: unknown) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseCookies(headers: Headers): string[] {
  return headers.getSetCookie?.() ?? [];
}

async function loadCookies(): Promise<string> {
  return (await AsyncStorage.getItem(COOKIE_KEY)) ?? "";
}

async function saveCookies(cookies: string[]): Promise<string> {
  const stored = (await AsyncStorage.getItem(COOKIE_KEY)) ?? "";
  const existing = new Map<string, string>();
  for (const c of stored.split("; ").filter(Boolean)) {
    const [k, v] = c.split("=");
    if (k && v !== undefined) existing.set(k, v);
  }
  for (const c of cookies) {
    const [pair] = c.split(";");
    const [k, v] = (pair ?? "").split("=");
    if (k && v !== undefined) existing.set(k.trim(), v.trim());
  }
  const joined = [...existing.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  await AsyncStorage.setItem(COOKIE_KEY, joined);
  return joined;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getHeaders = useCallback(async () => {
    const cookie = await loadCookies();
    return {
      "Content-Type": "application/json",
      "Cookie": cookie,
      "X-Tenant": TENANT,
    };
  }, []);

  const apiGet = useCallback(async <T>(path: string): Promise<T> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
    const cookies = parseCookies(res.headers);
    if (cookies.length > 0) await saveCookies(cookies);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }, [getHeaders]);

  const apiPost = useCallback(async <T>(path: string, body: unknown): Promise<T> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const cookies = parseCookies(res.headers);
    if (cookies.length > 0) await saveCookies(cookies);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Hata" }));
      throw new Error(err.message ?? String(res.status));
    }
    return res.json();
  }, [getHeaders]);

  const apiPatch = useCallback(async <T>(path: string, body: unknown): Promise<T> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    const cookies = parseCookies(res.headers);
    if (cookies.length > 0) await saveCookies(cookies);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Hata" }));
      throw new Error(err.message ?? String(res.status));
    }
    return res.json();
  }, [getHeaders]);

  const apiPut = useCallback(async <T>(path: string, body: unknown): Promise<T> => {
    const headers = await getHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    const cookies = parseCookies(res.headers);
    if (cookies.length > 0) await saveCookies(cookies);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Hata" }));
      throw new Error(err.message ?? String(res.status));
    }
    return res.json();
  }, [getHeaders]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(USER_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const me = await apiGet<User>("/auth/me");
          setUser(me ?? parsed);
        }
      } catch {
        await AsyncStorage.removeItem(USER_KEY);
        await AsyncStorage.removeItem(COOKIE_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Tenant": TENANT,
      };
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers,
        body: JSON.stringify({ username, password }),
      });
      const cookies = parseCookies(res.headers);
      if (cookies.length > 0) await saveCookies(cookies);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err.message ?? "Kullanıcı adı veya şifre yanlış" };
      }
      const data = await res.json();
      setUser(data.user);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
      return {};
    } catch {
      return { error: "Sunucuya bağlanılamadı" };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/auth/logout", {});
    } catch {
    }
    await AsyncStorage.removeItem(USER_KEY);
    await AsyncStorage.removeItem(COOKIE_KEY);
    setUser(null);
  }, [apiPost]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, apiGet, apiPost, apiPatch, apiPut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
