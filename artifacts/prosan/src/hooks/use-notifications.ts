import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Notification {
  id: number;
  companyId: number;
  userId: number | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  entityType: string | null;
  entityId: number | null;
  createdAt: string;
}

async function apiCall(method: string, path: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export function useNotificationsCount() {
  return useQuery<{ unread: number }>({
    queryKey: ["notifications-count"],
    queryFn: () => apiCall("GET", "/notifications/count"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useNotifications(unread = false) {
  return useQuery<{ notifications: Notification[]; total: number }>({
    queryKey: ["notifications", unread],
    queryFn: () => apiCall("GET", `/notifications?unread=${unread}&limit=20`),
    staleTime: 15_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiCall("PUT", `/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiCall("PUT", "/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });
}

export function useGenerateNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiCall("POST", "/notifications/generate"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
  });
}
