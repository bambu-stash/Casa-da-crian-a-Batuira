"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings, Bot, LogOut, Headphones, MessageCircle } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase";
import { healthCheck, getDashboardStats, getSettings, updateSettings, getConversations, type HealthData, type DashboardStats, type Conversation } from "@/lib/api";
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

function relativeTime(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export default function Dashboard() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [botEnabled, setBotEnabled] = useState(true);
  const [orgName, setOrgName] = useState("Casa da Criança Batuira");
  const [confirmDisableBot, setConfirmDisableBot] = useState(false);
  const [recentConvs, setRecentConvs] = useState<Conversation[]>([]);

  const loadRecentConvs = async () => {
    const all = await getConversations();
    if (!all) return;
    const filtered = all.filter((c) => c.status === "waiting" || c.status === "active");
    const sorted = [...filtered].sort((a, b) => {
      const aUnread = (a.unread_count ?? 0) > 0 ? 1 : 0;
      const bUnread = (b.unread_count ?? 0) > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    setRecentConvs(sorted);
  };

  useEffect(() => {
    healthCheck().then(setHealth);
    getDashboardStats().then(setStats);
    getSettings().then((s) => {
      if (s) {
        setBotEnabled(s.bot_enabled);
        setOrgName(s.org_name);
      }
    });
    loadRecentConvs();
    const interval = setInterval(() => {
      getDashboardStats().then(setStats);
      loadRecentConvs();
    }, 8000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

          {/* Conversas Recentes */}
          {recentConvs.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-400 uppercase">Conversas Recentes</h2>
                <Link href="/atendimento" className="text-xs text-blue-500 hover:underline">ver todas</Link>
              </div>
              <div className="space-y-2">
                {recentConvs.slice(0, 10).map((conv) => {
                  const isMae = conv.sector_institution === "mae" || conv.institution === "mae";
                  const hasUnread = (conv.unread_count ?? 0) > 0;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => router.push(`/atendimento?conv=${conv.id}`)}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border shadow-sm hover:shadow-md transition cursor-pointer ${
                        isMae
                          ? "bg-pink-50 border-pink-100 hover:bg-pink-100"
                          : "bg-white border-gray-100 hover:bg-gray-50"
                      }`}
                    >
                      {/* indicador de não lida */}
                      <div className="shrink-0 relative">
                        <MessageCircle className={`w-8 h-8 ${isMae ? "text-pink-400" : "text-blue-400"}`} />
                        {hasUnread && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                            {conv.unread_count! > 9 ? "9+" : conv.unread_count}
                          </span>
                        )}
                      </div>

                      {/* info principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-sm font-semibold truncate ${isMae ? "text-pink-900" : "text-gray-900"}`}>
                            {conv.contact_name || conv.contact_phone}
                          </span>
                          {conv.contact_name && (
                            <span className="text-xs text-gray-400 truncate shrink-0">{conv.contact_phone}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-0.5">
                          {conv.sector_emoji && <span>{conv.sector_emoji}</span>}
                          <span className="truncate">{conv.sector_name ?? "Sem setor"}</span>
                          <span className="text-gray-300">·</span>
                          <span className={`shrink-0 font-medium ${conv.status === "waiting" ? "text-amber-600" : "text-green-600"}`}>
                            {conv.status === "waiting" ? "Aguardando" : "Em atendimento"}
                          </span>
                        </div>
                        {conv.last_message && (
                          <p className="text-xs text-gray-400 truncate">{conv.last_message}</p>
                        )}
                      </div>

                      {/* hora */}
                      <div className="shrink-0 text-right">
                        <span className="text-xs text-gray-400">{relativeTime(conv.updated_at)}</span>
                      </div>
                    </button>
                  );
                })}
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
