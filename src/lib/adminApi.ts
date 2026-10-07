import { getToken } from "@/lib/api";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export function getAdminToken() { return getToken(); }
export function clearAdminToken() {
  localStorage.removeItem("bfs_admin_token");
  localStorage.removeItem("bfs_admin_user");
}

export async function adminFetch(path: string, options: RequestInit = {}) {
  const token = getAdminToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || "Admin request failed");
  return data;
}
