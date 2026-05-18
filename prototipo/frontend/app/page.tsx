"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Users, GitBranch, Settings, Bot, LogOut, Headphones } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";
import { healthCheck, getDashboardStats, getSettings, updateSettings, type HealthData, type DashboardStats } from "@/lib/api";
import { useRouter } from "next/navigation";

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ServiceDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-500" : "bg-red-400"}`} />
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [botEnabled, setBotEnabled] = useState(true);
  const [orgName, setOrgName] = useState("Casa da Criança Batuira");

  useEffect(() => {
    healthCheck().then(setHealth);
    getDashboardStats().then(setStats);
    getSettings().then((s) => {
      if (s) {
        setBotEnabled(s.bot_enabled);
        setOrgName(s.org_name);
      }
    });
    const interval = setInterval(() => {
      getDashboardStats().then(setStats);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const toggleBot = async () => {
    const next = !botEnabled;
    setBotEnabled(next);
    await updateSettings({ bot_enabled: next });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const svc = health?.services;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🏠 {orgName}</h1>
              <p className="text-sm text-gray-500">Painel de Controle</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleBot}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition ${
                  botEnabled ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                <Bot className="w-3 h-3" />
                Bot {botEnabled ? "ativo" : "inativo"}
              </button>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                health ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
              }`}>
                {health ? "Online" : "Offline"}
              </span>
              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-gray-600 transition"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Integrações */}
          {health && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow p-4">
              <div className="flex items-center gap-6 flex-wrap">
                {[
                  { label: "Evolution API", ok: svc?.evolution_api === "configured" },
                  { label: "Anthropic (Claude)", ok: svc?.anthropic === "configured" },
                ].map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-2 text-sm text-gray-600">
                    <ServiceDot ok={ok} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Atendimentos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Total" value={stats.total_conversations} color="text-gray-800" />
                <StatCard label="Aguardando" value={stats.waiting} color="text-amber-600" sub="sem atendente" />
                <StatCard label="Em andamento" value={stats.active} color="text-green-600" sub="com atendente" />
                <StatCard
                  label="Setores ativos"
                  value={stats.by_sector.filter((s) => s.total > 0).length}
                  color="text-blue-600"
                />
              </div>
            </section>
          )}

          {/* Por setor */}
          {stats && stats.by_sector.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Fila por Setor</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.by_sector.map((s) => (
                  <div key={s.name} className="bg-white rounded-2xl border border-gray-100 shadow p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{s.emoji}</span>
                      <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{s.waiting}</p>
                    <p className="text-xs text-gray-400">aguardando</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Ações */}
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Navegação</h2>
            <div className="flex gap-3 flex-wrap">
              <Link
                href="/atendimento"
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
              >
                <Headphones className="w-4 h-4" />
                Painel de Atendimento
              </Link>
              <Link
                href="/flow"
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
              >
                <GitBranch className="w-4 h-4" />
                Editor de Fluxo
              </Link>
              <Link
                href="/configuracoes"
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
              >
                <Settings className="w-4 h-4" />
                Configurações
              </Link>
            </div>
          </section>

        </div>
      </main>
    </AuthGuard>
  );
}
