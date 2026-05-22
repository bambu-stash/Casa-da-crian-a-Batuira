"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, Settings, Bot, LogOut, Headphones } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase";
import { healthCheck, getDashboardStats, getSettings, updateSettings, type HealthData, type DashboardStats } from "@/lib/api";
import { useRouter } from "next/navigation";

function StatCard({ label, value, sub, color, href }: { label: string; value: number; sub?: string; color: string; href?: string }) {
  const inner = (
    <>
      <p className="text-xs font-semibold text-gray-400 uppercase">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block bg-white rounded-2xl border border-gray-100 shadow p-5 hover:shadow-md transition cursor-pointer">
        {inner}
      </Link>
    );
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow p-5">
      {inner}
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
  const [confirmDisableBot, setConfirmDisableBot] = useState(false);

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

  const toggleBot = () => {
    if (botEnabled) {
      setConfirmDisableBot(true);
    } else {
      setBotEnabled(true);
      updateSettings({ bot_enabled: true });
    }
  };

  const handleDisableBotConfirmed = async () => {
    setConfirmDisableBot(false);
    setBotEnabled(false);
    await updateSettings({ bot_enabled: false });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const svc = health?.services;

  return (
    <AuthGuard>
      {confirmDisableBot && (
        <ConfirmDialog
          title="Desativar o bot?"
          message="Novas mensagens não receberão menu automático enquanto o bot estiver inativo."
          confirmLabel="Desativar"
          danger
          onConfirm={handleDisableBotConfirmed}
          onCancel={() => setConfirmDisableBot(false)}
        />
      )}
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
                ].map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-2 text-sm text-gray-600">
                    <ServiceDot ok={ok} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ação principal */}
          <Link
            href="/atendimento"
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 transition self-start w-full sm:w-auto justify-center sm:justify-start"
          >
            <Headphones className="w-4 h-4" />
            Painel de Atendimento
            {stats && stats.waiting > 0 && (
              <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {stats.waiting} aguardando
              </span>
            )}
          </Link>

          {/* Stats */}
          {stats && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Atendimentos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Total" value={stats.total_conversations} color="text-gray-800" />
                <StatCard label="Aguardando" value={stats.waiting} color="text-amber-600" sub="sem atendente" href="/atendimento?status=waiting" />
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
          {stats && stats.by_sector.length > 0 && (() => {
            const criancaSectors = stats.by_sector.filter((s) => s.institution !== "mae");
            const maeSectors     = stats.by_sector.filter((s) => s.institution === "mae");
            return (
              <section className="space-y-5">
                <h2 className="text-sm font-semibold text-gray-400 uppercase">Fila por Setor</h2>

                {/* Casa da Criança */}
                {criancaSectors.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                      🏠 Casa da Criança Batuira
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {criancaSectors.map((s) => (
                        <div key={`crianca-${s.name}`} className="bg-white rounded-2xl border border-gray-100 shadow p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{s.emoji}</span>
                            <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                          </div>
                          <p className="text-2xl font-bold text-blue-600">{s.waiting}</p>
                          <p className="text-xs text-gray-400">aguardando</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Casa da Mãe */}
                {maeSectors.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-pink-600 uppercase tracking-wider mb-2">
                      💗 Casa da Mãe Batuira
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {maeSectors.map((s) => (
                        <div key={`mae-${s.name}`} className="bg-pink-50 rounded-2xl border border-pink-100 shadow p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{s.emoji}</span>
                            <p className="text-sm font-semibold text-pink-800">{s.name}</p>
                          </div>
                          <p className="text-2xl font-bold text-pink-600">{s.waiting}</p>
                          <p className="text-xs text-pink-400">aguardando</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })()}

          {/* Navegação secundária */}
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Ferramentas</h2>
            <div className="flex gap-3 flex-wrap">
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
