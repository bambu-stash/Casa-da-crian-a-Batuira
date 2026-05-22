import { getAuthToken } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function post<T>(path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: await authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function put<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function patch<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function del(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthData {
  status: string;
  services: {
    evolution_api: "configured" | "missing_key";
  };
}

export interface BotSettings {
  org_name: string;
  bot_enabled: boolean;
  bot_fallback_phone: string;
  evolution_api_key?: string;
  evolution_api_url?: string;
  evolution_instance?: string;
}

export interface Sector {
  id: number;
  name: string;
  description: string;
  emoji: string;
  menu_order: number;
  active: number;
  institution: "crianca" | "mae";
}

export interface Attendant {
  id: number;
  name: string;
  sector_id: number;
  sector_name: string;
  whatsapp_number: string;
  email: string;
  active: number;
  role: string;
  avatar_url: string;
  bio: string;
}

export interface Conversation {
  id: number;
  contact_phone: string;
  contact_name: string;
  sector_id: number | null;
  sector_name: string | null;
  sector_emoji: string | null;
  sector_institution: "crianca" | "mae" | null;
  attendant_id: number | null;
  attendant_name: string | null;
  status: "pending_institution" | "pending_menu" | "waiting" | "active" | "closed";
  institution: "crianca" | "mae" | "";
  created_at: string;
  updated_at: string;
  last_message: string | null;
  unread_count: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  content: string;
  direction: "in" | "out";
  created_at: string;
}

export interface ApiKey {
  id: number;
  name: string;
  user_email: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  active: number;
  key?: string; // only on creation
}

export interface DashboardStats {
  total_conversations: number;
  waiting: number;
  active: number;
  by_sector: { name: string; emoji: string; institution: string; total: number; waiting: number }[];
}

// ── API functions ─────────────────────────────────────────────────────────────

export const healthCheck = () => get<HealthData>("/health");
export const getSettings = () => get<BotSettings>("/settings");
export const updateSettings = (p: Partial<BotSettings>) => patch<BotSettings>("/settings", p);

export const getSectors = () => get<Sector[]>("/sectors");
export const createSector = (b: Omit<Sector, "id">) => post<Sector>("/sectors", b);
export const updateSector = (id: number, b: Omit<Sector, "id">) =>
  put<Sector>(`/sectors/${id}`, b);
export const deleteSector = (id: number) => del(`/sectors/${id}`);

export const getAttendants = () => get<Attendant[]>("/attendants");
export const createAttendant = (b: Omit<Attendant, "id" | "sector_name">) =>
  post<Attendant>("/attendants", b);
export const updateAttendant = (id: number, b: Omit<Attendant, "id" | "sector_name">) =>
  put<Attendant>(`/attendants/${id}`, b);
export const deleteAttendant = (id: number) => del(`/attendants/${id}`);

export const getConversations = (params?: {
  status?: string;
  sector_id?: number;
  attendant_id?: number;
}) => {
  const qs = params
    ? "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString()
    : "";
  return get<Conversation[]>(`/conversations${qs}`);
};
export const getMessages = (convId: number) =>
  get<Message[]>(`/conversations/${convId}/messages`);
export const assignConversation = (convId: number, attendantId: number) =>
  post<{ success: boolean; attendant: Attendant }>(
    `/conversations/${convId}/assign?attendant_id=${attendantId}`
  );
export const replyConversation = (convId: number, text: string) =>
  post<{ success: boolean }>(`/conversations/${convId}/reply`, { text });
export const closeConversation = (convId: number) =>
  post<{ success: boolean }>(`/conversations/${convId}/close`);

export const getApiKeys = () => get<ApiKey[]>("/api-keys");
export const createApiKey = (b: { name: string; user_email: string }) =>
  post<ApiKey>("/api-keys", b);
export const revokeApiKey = (id: number) => del(`/api-keys/${id}`);

export const getDashboardStats = () => get<DashboardStats>("/dashboard/stats");

export interface QRCodeData {
  base64: string;
  pairing_code: string;
}
export const getQRCode = () => get<QRCodeData>("/whatsapp/qrcode");

export interface FlowData {
  id: number;
  name: string;
  nodes: unknown[];
  edges: unknown[];
  active: number;
  created_at: string;
  updated_at: string;
}

export const getFlow = () => get<FlowData>("/flow");
export const saveFlow = (body: { name: string; nodes: unknown[]; edges: unknown[] }) =>
  post<FlowData>("/flow", body);
