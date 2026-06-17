/**
 * Autenticação: tenta Supabase se configurado, caso contrário usa auth local
 * com token JWT armazenado no localStorage.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export const supabase = createClient(supabaseUrl || "https://placeholder.supabase.co", supabaseAnonKey || "placeholder");

const SUPABASE_ACTIVE = !!(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("placeholder"));

const LOCAL_TOKEN_KEY = "batuira_token";

// ── Auth local (quando Supabase não está configurado) ─────────────────────────

export async function localLogin(email: string, password: string): Promise<{ error?: string }> {
  try {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.detail ?? "E-mail ou senha incorretos." };
    }
    const data = await res.json();
    localStorage.setItem(LOCAL_TOKEN_KEY, data.access_token);
    return {};
  } catch {
    return { error: "Erro de conexão com o servidor." };
  }
}

export function localLogout() {
  localStorage.removeItem(LOCAL_TOKEN_KEY);
}

export function getLocalToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LOCAL_TOKEN_KEY);
}

export function isLocalLoggedIn(): boolean {
  return !!getLocalToken();
}

// ── Interface unificada ────────────────────────────────────────────────────────

export async function getAuthToken(): Promise<string | null> {
  if (SUPABASE_ACTIVE) {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }
  return getLocalToken();
}

export async function isAuthenticated(): Promise<boolean> {
  if (SUPABASE_ACTIVE) {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  }
  return isLocalLoggedIn();
}

export async function signOut(): Promise<void> {
  if (SUPABASE_ACTIVE) {
    await supabase.auth.signOut();
  }
  localLogout();
}
