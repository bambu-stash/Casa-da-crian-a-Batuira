"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase, localLogin } from "@/lib/supabase";
import { LogIn, UserPlus, Eye, EyeOff, ChevronDown } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const SUPABASE_ACTIVE = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
);

interface Sector {
  id: number;
  name: string;
  institution: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  // register
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regSector, setRegSector] = useState<number | "">("");
  const [showRegPw, setShowRegPw] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch(`${BASE}/sectors`)
      .then((r) => r.json())
      .then((data: Sector[]) => setSectors(data.filter((s) => s.name)))
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (SUPABASE_ACTIVE) {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (err) { setError("E-mail ou senha incorretos."); return; }
    } else {
      const { error: err } = await localLogin(email, password);
      setLoading(false);
      if (err) { setError(err); return; }
    }

    router.replace("/");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (regPassword !== regConfirm) { setError("As senhas não coincidem."); return; }
    if (regPassword.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (!regSector) { setError("Selecione um setor."); return; }

    setLoading(true);
    try {
      const res = await fetch(`${BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword, sector_id: regSector }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setError(data.detail ?? "E-mail já cadastrado.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Erro ao criar conta.");
        setLoading(false);
        return;
      }

      // Login automático após cadastro
      if (SUPABASE_ACTIVE) {
        const { error: err } = await supabase.auth.signInWithPassword({ email: regEmail, password: regPassword });
        setLoading(false);
        if (!err) { router.replace("/"); return; }
      } else {
        const { error: err } = await localLogin(regEmail, regPassword);
        setLoading(false);
        if (!err) { router.replace("/"); return; }
      }

      setSuccess("Conta criada! Faça login para continuar.");
      setMode("login");
      setEmail(regEmail);
    } catch {
      setError("Erro de conexão. Verifique se o servidor está rodando.");
      setLoading(false);
    }
  };

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setError("");
    setSuccess("");
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <span className="text-2xl">🏠</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Casa da Criança Batuira</h1>
          <p className="text-sm text-gray-500 mt-1">Painel de Atendimento</p>
        </div>

        {/* Toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => switchMode("login")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
              mode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Entrar
          </button>
          <button
            onClick={() => switchMode("register")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
              mode === "register" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Criar conta
          </button>
        </div>

        {/* ── Login ── */}
        {mode === "login" && (
          <form onSubmit={handleLogin} className="bg-white rounded-2xl border border-gray-100 shadow p-6 space-y-4">
            {success && (
              <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">{success}</p>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">E-mail</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required autoFocus placeholder="seu@email.com"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Senha</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="button" onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
              <LogIn className="w-4 h-4" />
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        )}

        {/* ── Cadastro ── */}
        {mode === "register" && (
          <form onSubmit={handleRegister} className="bg-white rounded-2xl border border-gray-100 shadow p-6 space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome completo</label>
              <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                required autoFocus placeholder="Seu nome"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">E-mail</label>
              <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                required placeholder="seu@email.com"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Setor</label>
              <div className="relative">
                <select value={regSector} onChange={(e) => setRegSector(Number(e.target.value))} required
                  className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">Selecione um setor…</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Senha</label>
              <div className="relative">
                <input type={showRegPw ? "text" : "password"} value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)} required minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="button" onClick={() => setShowRegPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showRegPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Confirmar senha</label>
              <input type={showRegPw ? "text" : "password"} value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)} required placeholder="Repita a senha"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
              <UserPlus className="w-4 h-4" />
              {loading ? "Criando conta…" : "Criar conta"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400">
          Acesso restrito a colaboradores autorizados.
        </p>
      </div>
    </main>
  );
}
