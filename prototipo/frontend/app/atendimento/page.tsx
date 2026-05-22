"use client";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft, Send, XCircle, RefreshCw, HandMetal,
  Settings, ChevronDown, Search,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getConversations, getMessages, getAttendants, getSectors, assignConversation,
  replyConversation, closeConversation,
  type Conversation, type Message, type Attendant, type Sector,
} from "@/lib/api";

// ── constants ─────────────────────────────────────────────────────────────────

const LS_KEY = "batuira_atd_collapsed";

// Palette para Casa da Criança Batuira (cores normais)
const CRIANCA_PALETTE = [
  { badge: "bg-blue-100 text-blue-700",      dot: "bg-blue-400"      },
  { badge: "bg-violet-100 text-violet-700",  dot: "bg-violet-400"    },
  { badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-400"   },
  { badge: "bg-orange-100 text-orange-700",  dot: "bg-orange-400"    },
  { badge: "bg-teal-100 text-teal-700",      dot: "bg-teal-400"      },
  { badge: "bg-amber-100 text-amber-700",    dot: "bg-amber-400"     },
];

// Palette para Casa da Mãe Batuira (tons rosa/pink)
const MAE_PALETTE = [
  { badge: "bg-pink-100 text-pink-700",      dot: "bg-pink-400"      },
  { badge: "bg-rose-100 text-rose-700",      dot: "bg-rose-400"      },
  { badge: "bg-fuchsia-100 text-fuchsia-700",dot: "bg-fuchsia-400"   },
  { badge: "bg-pink-200 text-pink-800",      dot: "bg-pink-500"      },
  { badge: "bg-rose-200 text-rose-800",      dot: "bg-rose-500"      },
  { badge: "bg-fuchsia-200 text-fuchsia-800",dot: "bg-fuchsia-500"   },
];

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  pending_institution: { dot: "bg-purple-400", label: "Aguard. Inst."  },
  pending_menu:        { dot: "bg-sky-400",    label: "Novo"           },
  waiting:             { dot: "bg-amber-400",  label: "Aguardando"     },
  active:              { dot: "bg-green-400",  label: "Em atendimento" },
  closed:              { dot: "bg-gray-300",   label: "Resolvido"      },
};

// ── helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function matchesSearch(conv: Conversation, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  return (
    (conv.contact_name ?? "").toLowerCase().includes(lq) ||
    (conv.contact_phone ?? "").includes(lq) ||
    (conv.last_message ?? "").toLowerCase().includes(lq)
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AtendimentoPage() {
  return (
    <Suspense>
      <AtendimentoInner />
    </Suspense>
  );
}

function AtendimentoInner() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "waiting";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected]           = useState<Conversation | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [attendants, setAttendants]       = useState<Attendant[]>([]);
  const [sectors, setSectors]             = useState<Sector[]>([]);
  const [replyText, setReplyText]         = useState("");
  const [sending, setSending]             = useState(false);
  const [assigning, setAssigning]         = useState<number | null>(null);
  const [filterStatus, setFilterStatus]   = useState<string>(initialStatus);
  const [search, setSearch]               = useState("");
  const [confirmClose, setConfirmClose]   = useState(false);
  // collapsed: key = sector_id as string, value = true means closed
  const [collapsed, setCollapsed]         = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<number>(0);
  const alertActiveRef = useRef<boolean>(false);

  // ── load & persist collapsed state ──────────────────────────────────────────

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setCollapsed(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const setCollapsedAndPersist = useCallback((next: Record<string, boolean>) => {
    setCollapsed(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const toggleSector = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Keep the active sector open whenever selected conversation changes
  useEffect(() => {
    if (!selected?.sector_id) return;
    const key = String(selected.sector_id);
    setCollapsed((prev) => {
      if (!prev[key]) return prev; // already open
      const next = { ...prev, [key]: false };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [selected?.sector_id]);

  // ── data loading ─────────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    const params: Record<string, string | number> = {};
    if (filterStatus) params.status = filterStatus;
    const data = await getConversations(params as Parameters<typeof getConversations>[0]);
    if (data) setConversations(data);
  }, [filterStatus]);

  useEffect(() => {
    Promise.all([getAttendants(), getSectors()]).then(([att, sec]) => {
      if (att) setAttendants(att);
      if (sec) setSectors(sec.filter((s) => s.active));
    });
  }, []);

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 4000);
    return () => clearInterval(t);
  }, [loadConversations]);

  useEffect(() => {
    if (!selected) return;
    const load = async () => {
      const msgs = await getMessages(selected.id);
      if (msgs) {
        setMessages(msgs);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [selected?.id]);

  // ── notification alert (title + favicon when tab is hidden) ─────────────────

  useEffect(() => {
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    const grew = totalUnread > prevUnreadRef.current;
    prevUnreadRef.current = totalUnread;

    const setFavicon = (alert: boolean) => {
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']") ??
        (() => {
          const el = document.createElement("link");
          el.rel = "icon";
          document.head.appendChild(el);
          return el;
        })();
      link.href = alert ? "/favicon-alert.svg?v=alert" : "/favicon.svg";
      link.type = "image/svg+xml";
    };

    if (grew && document.visibilityState === "hidden") {
      alertActiveRef.current = true;
      document.title = `(${totalUnread}) Painel de Atendimento`;
      setFavicon(true);
    }

    const clearAlert = () => {
      if (alertActiveRef.current) {
        alertActiveRef.current = false;
        document.title = "Painel de Atendimento";
        setFavicon(false);
      }
    };

    document.addEventListener("visibilitychange", clearAlert);
    return () => document.removeEventListener("visibilitychange", clearAlert);
  }, [conversations]);

  // ── actions ──────────────────────────────────────────────────────────────────

  const handleSelect = async (conv: Conversation) => {
    setSelected(conv);
    const msgs = await getMessages(conv.id);
    if (msgs) setMessages(msgs);
  };

  const handleAssign = async (attendantId: number) => {
    if (!selected) return;
    setAssigning(attendantId);
    const res = await assignConversation(selected.id, attendantId);
    setAssigning(null);
    if (res) {
      setSelected({ ...selected, status: "active", attendant_id: attendantId, attendant_name: res.attendant.name });
      loadConversations();
    }
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    await replyConversation(selected.id, replyText.trim());
    setSending(false);
    setReplyText("");
    const msgs = await getMessages(selected.id);
    if (msgs) {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  };

  const handleClose = () => setConfirmClose(true);

  const handleCloseConfirmed = async () => {
    setConfirmClose(false);
    if (!selected) return;
    await closeConversation(selected.id);
    setSelected(null);
    loadConversations();
  };

  // ── derived ──────────────────────────────────────────────────────────────────

  const sectorAttendants = selected
    ? attendants.filter((a) => a.sector_id === selected.sector_id && a.active)
    : [];

  const waitingTotal = conversations.filter((c) => c.status === "waiting").length;

  // Conversas aguardando triagem (sem instituição definida ainda)
  const triageConvs = conversations.filter(
    (c) => matchesSearch(c, search) && c.status === "pending_institution"
  );

  // Group conversations by sector_id; null/undefined go into "no_sector" (excludes triage)
  const bySektor = new Map<number | null, Conversation[]>();
  for (const conv of conversations) {
    if (!matchesSearch(conv, search)) continue;
    if (conv.status === "pending_institution") continue;
    const key = conv.sector_id ?? null;
    if (!bySektor.has(key)) bySektor.set(key, []);
    bySektor.get(key)!.push(conv);
  }

  const criancaSectors = sectors.filter((s) => s.institution === "crianca" || !s.institution);
  const maeSectors     = sectors.filter((s) => s.institution === "mae");

  // When searching, treat all sectors as expanded
  const isOpen = (id: string) => search.trim() !== "" || !collapsed[id];

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <AuthGuard>
      <main className="h-screen bg-gray-50 flex flex-col">

        {/* top bar */}
        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
          <Link href="/" className="text-gray-400 hover:text-gray-700 transition">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-sm font-bold text-gray-900">Painel de Atendimento</h1>
          {waitingTotal > 0 && filterStatus !== "waiting" && (
            <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
              {waitingTotal} aguardando
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos os status</option>
              <option value="pending_institution">Triagem</option>
              <option value="waiting">Aguardando</option>
              <option value="active">Em atendimento</option>
              <option value="closed">Encerradas</option>
            </select>
            <button onClick={loadConversations} className="text-gray-400 hover:text-gray-700 transition p-1" title="Atualizar">
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link href="/configuracoes" className="text-gray-400 hover:text-gray-700 transition p-1" title="Configurações">
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {confirmClose && selected && (
          <ConfirmDialog
            title="Encerrar atendimento?"
            message={`Encerrar a conversa de ${selected.contact_name || selected.contact_phone}? Esta ação não pode ser desfeita.`}
            confirmLabel="Encerrar"
            danger
            onConfirm={handleCloseConfirmed}
            onCancel={() => setConfirmClose(false)}
          />
        )}

        <div className="flex flex-1 min-h-0">

          {/* ── sidebar ────────────────────────────────────────────────────── */}
          <aside className="w-72 shrink-0 border-r border-gray-100 bg-white flex flex-col overflow-hidden">

            {/* search bar */}
            <div className="px-3 py-2.5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou mensagem…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none w-full"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 shrink-0 text-xs leading-none">
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* sector groups — divided by institution */}
            <div className="overflow-y-auto flex-1">

              {/* ── Aguardando Triagem ── */}
              {triageConvs.length > 0 && (
                <SectorGroup
                  sectorKey="triage"
                  label="⏳ Aguardando Triagem"
                  conversations={triageConvs}
                  palette={{ badge: "bg-purple-100 text-purple-700", dot: "bg-purple-400" }}
                  open={isOpen("triage")}
                  selectedId={selected?.id ?? null}
                  onToggle={() => toggleSector("triage")}
                  onSelect={handleSelect}
                />
              )}

              {/* ── Casa da Criança Batuira ── */}
              <div className="px-3 pt-3 pb-1">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                  🏠 Casa da Criança Batuira
                </p>
              </div>
              {criancaSectors.map((sector, idx) => {
                const sectorKey = String(sector.id);
                const convs = bySektor.get(sector.id) ?? [];
                const palette = CRIANCA_PALETTE[idx % CRIANCA_PALETTE.length];
                return (
                  <SectorGroup
                    key={sector.id}
                    sectorKey={sectorKey}
                    label={`${sector.emoji} ${sector.name}`}
                    conversations={convs}
                    palette={palette}
                    open={isOpen(sectorKey)}
                    selectedId={selected?.id ?? null}
                    onToggle={() => toggleSector(sectorKey)}
                    onSelect={handleSelect}
                  />
                );
              })}

              {/* ── Casa da Mãe Batuira ── */}
              <div className="px-3 pt-4 pb-1 border-t border-pink-100 mt-1">
                <p className="text-[10px] font-bold text-pink-600 uppercase tracking-wider">
                  💗 Casa da Mãe Batuira
                </p>
              </div>
              {maeSectors.map((sector, idx) => {
                const sectorKey = String(sector.id);
                const convs = bySektor.get(sector.id) ?? [];
                const palette = MAE_PALETTE[idx % MAE_PALETTE.length];
                return (
                  <SectorGroup
                    key={sector.id}
                    sectorKey={sectorKey}
                    label={`${sector.emoji} ${sector.name}`}
                    conversations={convs}
                    palette={palette}
                    open={isOpen(sectorKey)}
                    selectedId={selected?.id ?? null}
                    onToggle={() => toggleSector(sectorKey)}
                    onSelect={handleSelect}
                    isMae
                  />
                );
              })}

              {/* "Sem setor" bucket for conversations without sector_id */}
              {(bySektor.get(null)?.length ?? 0) > 0 && (
                <SectorGroup
                  sectorKey="null"
                  label="📋 Sem setor"
                  conversations={bySektor.get(null) ?? []}
                  palette={{ badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" }}
                  open={isOpen("null")}
                  selectedId={selected?.id ?? null}
                  onToggle={() => toggleSector("null")}
                  onSelect={handleSelect}
                />
              )}

              {conversations.length === 0 && (
                <p className="p-6 text-center text-xs text-gray-400">
                  Nenhuma conversa encontrada.
                </p>
              )}
            </div>
          </aside>

          {/* ── chat area ──────────────────────────────────────────────────── */}
          <section className="flex-1 flex flex-col min-h-0 min-w-0">
            {!selected ? (
              <EmptyState />
            ) : (
              <ChatView
                conv={selected}
                messages={messages}
                sectorAttendants={sectorAttendants}
                replyText={replyText}
                sending={sending}
                assigning={assigning}
                bottomRef={bottomRef}
                onReplyChange={setReplyText}
                onReply={handleReply}
                onAssign={handleAssign}
                onClose={handleClose}
              />
            )}
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}

// ── SectorGroup ───────────────────────────────────────────────────────────────

function SectorGroup({
  sectorKey, label, conversations, palette, open, selectedId, onToggle, onSelect, isMae,
}: {
  sectorKey: string;
  label: string;
  conversations: Conversation[];
  palette: { badge: string; dot: string };
  open: boolean;
  selectedId: number | null;
  onToggle: () => void;
  onSelect: (c: Conversation) => void;
  isMae?: boolean;
}) {
  return (
    <div className={`border-b ${isMae ? "border-pink-50" : "border-gray-50"}`}>
      {/* header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2.5 transition text-left ${
          isMae ? "hover:bg-pink-50" : "hover:bg-gray-50"
        }`}
      >
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isMae ? "text-pink-300" : "text-gray-400"}`}
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
        <span className={`text-xs font-semibold flex-1 truncate ${isMae ? "text-pink-700" : "text-gray-700"}`}>{label}</span>
        {conversations.length > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${palette.badge}`}>
            {conversations.length}
          </span>
        )}
      </button>

      {/* collapsible list — CSS grid rows animation */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease",
        }}
      >
        <div className="overflow-hidden">
          {conversations.length === 0 ? (
            <p className={`px-4 py-3 text-[11px] italic ${isMae ? "text-pink-300" : "text-gray-400"}`}>
              Nenhuma conversa neste setor.
            </p>
          ) : (
            conversations.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                selected={conv.id === selectedId}
                dotColor={palette.dot}
                onSelect={() => onSelect(conv)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── ConvItem ──────────────────────────────────────────────────────────────────

function ConvItem({
  conv, selected, dotColor, onSelect,
}: {
  conv: Conversation;
  selected: boolean;
  dotColor: string;
  onSelect: () => void;
}) {
  const status = STATUS_CONFIG[conv.status] ?? { dot: "bg-gray-300", label: conv.status };
  const waitMinutes = Math.floor(
    (Date.now() - new Date(conv.updated_at.replace(" ", "T")).getTime()) / 60000
  );
  const isUrgent = conv.status === "waiting" && waitMinutes >= 10;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition ${
        selected ? "bg-blue-50 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-center gap-2">
        {/* sector color dot */}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />

        <div className="flex-1 min-w-0">
          {/* row 1: name + time */}
          <div className="flex items-baseline justify-between gap-1">
            <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
              {conv.contact_name || conv.contact_phone}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {conv.unread_count > 0 && (
                <span className="bg-blue-500 text-white text-[9px] font-bold min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center">
                  {conv.unread_count > 9 ? "9+" : conv.unread_count}
                </span>
              )}
              <span className={`text-[10px] font-medium ${isUrgent ? "text-red-500" : "text-gray-400"}`}>
                {relativeTime(conv.updated_at)}
              </span>
            </div>
          </div>

          {/* row 2: message preview */}
          {conv.last_message && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5 leading-tight">
              {conv.last_message}
            </p>
          )}

          {/* row 3: status dot + label */}
          <div className="flex items-center gap-1 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            <span className="text-[10px] text-gray-500">{status.label}</span>
            {conv.attendant_name && conv.status === "active" && (
              <span className="text-[10px] text-blue-400 truncate ml-1">· {conv.attendant_name}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── StatusPill (used in ChatView header) ──────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  const styles: Record<string, string> = {
    pending_institution: "bg-purple-50 text-purple-600",
    pending_menu:        "bg-sky-50 text-sky-600",
    waiting:             "bg-amber-50 text-amber-700",
    active:              "bg-green-50 text-green-700",
    closed:              "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${styles[status] ?? "bg-gray-100 text-gray-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot ?? "bg-gray-400"}`} />
      {cfg?.label ?? status}
    </span>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">💬</div>
      <p className="text-sm">Selecione uma conversa para atender</p>
    </div>
  );
}

// ── ChatView ──────────────────────────────────────────────────────────────────

function ChatView({
  conv, messages, sectorAttendants, replyText, sending, assigning,
  bottomRef, onReplyChange, onReply, onAssign, onClose,
}: {
  conv: Conversation;
  messages: Message[];
  sectorAttendants: Attendant[];
  replyText: string;
  sending: boolean;
  assigning: number | null;
  bottomRef: React.RefObject<HTMLDivElement>;
  onReplyChange: (v: string) => void;
  onReply: () => void;
  onAssign: (id: number) => void;
  onClose: () => void;
}) {
  const canReply = conv.status === "active";

  return (
    <>
      {/* header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">
            {conv.contact_name || conv.contact_phone}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {conv.institution === "mae"
              ? <span className="text-pink-500 font-medium">💗 Casa da Mãe</span>
              : <span className="text-blue-500 font-medium">🏠 Casa da Criança</span>}
            {conv.sector_name && <span> · {conv.sector_emoji} {conv.sector_name}</span>}
            {conv.contact_name && <span className="ml-1 text-gray-300">· {conv.contact_phone}</span>}
          </p>
        </div>
        <StatusPill status={conv.status} />
        {conv.status !== "closed" && (
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition"
          >
            <XCircle className="w-3.5 h-3.5" />
            Encerrar
          </button>
        )}
      </div>

      {/* waiting — assign banner */}
      {conv.status === "waiting" && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 shrink-0">
          <p className="text-xs font-semibold text-amber-700 mb-2">
            ⏳ Aguardando atendente — quem vai assumir?
          </p>
          {sectorAttendants.length === 0 ? (
            <p className="text-xs text-amber-600">
              Nenhum atendente ativo neste setor.{" "}
              <a href="/configuracoes/atendentes" className="underline">Configurar</a>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sectorAttendants.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onAssign(a.id)}
                  disabled={assigning !== null}
                  className="flex items-center gap-1.5 text-xs font-medium bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  <HandMetal className="w-3.5 h-3.5" />
                  {assigning === a.id ? "Assumindo…" : `Assumir como ${a.name}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* active — attendant bar */}
      {conv.status === "active" && conv.attendant_name && (
        <div className="bg-green-50 border-b border-green-100 px-4 py-2 shrink-0">
          <p className="text-xs text-green-700">
            <span className="font-semibold">👤 {conv.attendant_name}</span> está atendendo
            {conv.sector_name && ` · ${conv.sector_emoji} ${conv.sector_name}`}
          </p>
        </div>
      )}

      {/* pending_institution — bot bar */}
      {conv.status === "pending_institution" && (
        <div className="bg-purple-50 border-b border-purple-100 px-4 py-2 shrink-0">
          <p className="text-xs text-purple-600">🤖 Bot aguardando contato escolher a instituição.</p>
        </div>
      )}

      {/* pending_menu — bot bar */}
      {conv.status === "pending_menu" && (
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 shrink-0">
          <p className="text-xs text-gray-500">
            🤖 Bot exibindo menu de setores
            {conv.institution === "mae" ? " — 💗 Casa da Mãe Batuira" : " — 🏠 Casa da Criança Batuira"}.
          </p>
        </div>
      )}

      {/* messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-center text-xs text-gray-400 mt-8">Nenhuma mensagem ainda.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-sm px-3 py-2 rounded-2xl text-sm shadow-sm ${
              msg.direction === "out"
                ? "bg-blue-600 text-white rounded-br-sm"
                : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <p className={`text-[10px] mt-1 ${msg.direction === "out" ? "text-blue-200" : "text-gray-400"}`}>
                {msg.created_at?.slice(11, 16)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* reply bar */}
      {conv.status === "closed" ? (
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 text-center text-xs text-gray-400 shrink-0">
          Conversa encerrada
        </div>
      ) : canReply ? (
        <div className="bg-white border-t border-gray-100 p-3 flex gap-2 shrink-0">
          <textarea
            value={replyText}
            onChange={(e) => onReplyChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onReply(); }
            }}
            placeholder="Digite sua resposta… (Enter para enviar, Shift+Enter para quebra de linha)"
            rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onReply}
            disabled={sending || !replyText.trim()}
            className="self-end flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <Send className="w-4 h-4" />
            {sending ? "…" : "Enviar"}
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 text-center text-xs text-gray-400 shrink-0">
          Assuma o atendimento acima para responder
        </div>
      )}
    </>
  );
}
