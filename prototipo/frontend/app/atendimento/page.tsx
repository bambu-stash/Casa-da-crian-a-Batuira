"use client";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Send, XCircle, Search, ArrowRightLeft, Bell, BellOff,
  ChevronRight, Settings, LogOut, Zap, X, User, FileText, Clock,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAttendant } from "@/lib/attendantContext";
import { signOut } from "@/lib/supabase";
import {
  getConversations, getMessages, getAttendants, getSectors,
  assignConversation, replyConversation, closeConversation, transferConversation,
  getContact, patchContact, getContactHistory, getQuickReplies,
  type Conversation, type Message, type Attendant, type Sector,
  type Contact, type QuickReply,
} from "@/lib/api";

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  waiting: 0, pending_menu: 1, pending_institution: 2, active: 3, closed: 4,
};

const STATUS_CONFIG: Record<string, { dot: string; label: string; badge: string }> = {
  pending_institution: { dot: "bg-purple-400", label: "Aguard. Inst.",  badge: "bg-purple-100 text-purple-700" },
  pending_menu:        { dot: "bg-sky-400",    label: "Novo",           badge: "bg-sky-100 text-sky-700"      },
  waiting:             { dot: "bg-amber-400",  label: "Aguardando",     badge: "bg-amber-100 text-amber-700"  },
  active:              { dot: "bg-green-400",  label: "Em atendimento", badge: "bg-green-100 text-green-700"  },
  closed:              { dot: "bg-gray-300",   label: "Resolvido",      badge: "bg-gray-100 text-gray-500"    },
};

const ATTENDANT_COLORS = [
  "bg-blue-200 text-blue-800", "bg-violet-200 text-violet-800",
  "bg-emerald-200 text-emerald-800", "bg-orange-200 text-orange-800",
  "bg-teal-200 text-teal-800", "bg-pink-200 text-pink-800",
];

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

function waitingMinutes(iso: string): number {
  return Math.floor((Date.now() - new Date(iso.replace(" ", "T")).getTime()) / 60000);
}

function displayName(conv: Conversation): string {
  return conv.contact_name_override || conv.contact_name || conv.contact_phone;
}

function matchesSearch(conv: Conversation, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  return (
    displayName(conv).toLowerCase().includes(lq) ||
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
  const router = useRouter();
  const { profile } = useAttendant();
  const initialConvId = searchParams.get("conv") ? Number(searchParams.get("conv")) : null;
  const initialStatus = initialConvId ? "" : (searchParams.get("status") ?? "waiting");
  const autoSelectedRef = useRef(false);

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
  const [transferSectorId, setTransferSectorId] = useState<number | null>(null);
  const [transferring, setTransferring]   = useState(false);
  const [soundEnabled, setSoundEnabled]   = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  const [quickReplies, setQuickReplies]   = useState<QuickReply[]>([]);
  const [showQRPicker, setShowQRPicker]   = useState(false);
  const [qrSearch, setQrSearch]           = useState("");

  const bottomRef   = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<number>(0);
  const alertActiveRef = useRef<boolean>(false);
  const audioRef    = useRef<HTMLAudioElement | null>(null);

  // ── init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    audioRef.current = new Audio("/notification.wav");
    const stored = localStorage.getItem("batuira_sound");
    if (stored !== null) setSoundEnabled(stored === "true");
    const cp = localStorage.getItem("batuira_contact_panel");
    if (cp !== null) setContactPanelOpen(cp === "true");
  }, []);

  useEffect(() => {
    Promise.all([getAttendants(), getSectors(), getQuickReplies()]).then(([att, sec, qr]) => {
      if (att) setAttendants(att);
      if (sec) setSectors(sec.filter((s) => s.active));
      if (qr) setQuickReplies(qr);
    });
  }, []);

  // ── data loading ──────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    const params: Record<string, string | number> = {};
    if (filterStatus) params.status = filterStatus;
    const data = await getConversations(params as Parameters<typeof getConversations>[0]);
    if (data) setConversations(data);
  }, [filterStatus]);

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 4000);
    return () => clearInterval(t);
  }, [loadConversations]);

  useEffect(() => {
    if (!initialConvId || autoSelectedRef.current || conversations.length === 0) return;
    const target = conversations.find((c) => c.id === initialConvId);
    if (target) {
      autoSelectedRef.current = true;
      handleSelect(target);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, initialConvId]);

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

  // ── notification alert + sound ────────────────────────────────────────────

  useEffect(() => {
    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
    const grew = totalUnread > prevUnreadRef.current;
    prevUnreadRef.current = totalUnread;

    if (grew) {
      if (soundEnabled && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
      if (document.visibilityState === "hidden") {
        alertActiveRef.current = true;
        document.title = `(${totalUnread}) Painel de Atendimento`;
      }
    }

    const clearAlert = () => {
      if (alertActiveRef.current) {
        alertActiveRef.current = false;
        document.title = "Casa da Criança Batuira";
      }
    };

    document.addEventListener("visibilitychange", clearAlert);
    return () => document.removeEventListener("visibilitychange", clearAlert);
  }, [conversations, soundEnabled]);

  // ── actions ───────────────────────────────────────────────────────────────

  const handleSelect = async (conv: Conversation) => {
    setSelected(conv);
    setTransferSectorId(null);
    setShowQRPicker(false);
    setQrSearch("");
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
    setShowQRPicker(false);
    const msgs = await getMessages(selected.id);
    if (msgs) {
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  };

  const handleCloseConfirmed = async () => {
    setConfirmClose(false);
    if (!selected) return;
    await closeConversation(selected.id);
    setSelected(null);
    loadConversations();
  };

  const handleTransfer = async () => {
    if (!selected || !transferSectorId) return;
    setTransferring(true);
    const res = await transferConversation(selected.id, transferSectorId);
    setTransferring(false);
    if (res) {
      setSelected(null);
      setTransferSectorId(null);
      loadConversations();
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("batuira_sound", String(next));
  };

  const toggleContactPanel = () => {
    const next = !contactPanelOpen;
    setContactPanelOpen(next);
    localStorage.setItem("batuira_contact_panel", String(next));
  };

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  const insertQuickReply = (content: string) => {
    setReplyText(content);
    setShowQRPicker(false);
    setQrSearch("");
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const sectorAttendants = selected
    ? attendants.filter((a) => a.sector_id === selected.sector_id && a.active)
    : [];

  const waitingTotal = conversations.filter((c) => c.status === "waiting").length;

  const sortedConvs = [...conversations]
    .filter((c) => matchesSearch(c, search))
    .sort((a, b) => {
      const so = (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5);
      if (so !== 0) return so;
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    });

  const transferableSectors = sectors.filter((s) => s.active && s.id !== selected?.sector_id);

  const filteredQR = quickReplies.filter((qr) => {
    const q = qrSearch.toLowerCase();
    if (!q) return true;
    return qr.title.toLowerCase().includes(q) || qr.shortcut.toLowerCase().includes(q) || qr.content.toLowerCase().includes(q);
  });

  const qrTrigger = replyText.startsWith("/");

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <AuthGuard>
      <main className="h-screen bg-gray-50 flex flex-col overflow-hidden">

        {confirmClose && selected && (
          <ConfirmDialog
            title="Encerrar atendimento?"
            message={`Encerrar a conversa de ${displayName(selected)}? O contato receberá uma mensagem de encerramento.`}
            confirmLabel="Encerrar"
            danger
            onConfirm={handleCloseConfirmed}
            onCancel={() => setConfirmClose(false)}
          />
        )}

        {/* ── TopNav ─────────────────────────────────────────────────────── */}
        <header className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-3 shrink-0 z-10">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">🏠 Batuira</span>
          </Link>

          <div className="flex-1" />

          {waitingTotal > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">
              {waitingTotal} aguardando
            </span>
          )}

          <button
            onClick={toggleSound}
            className="text-gray-400 hover:text-gray-600 transition p-1"
            title={soundEnabled ? "Silenciar notificações" : "Ativar som"}
          >
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu((p) => !p)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition px-2 py-1 rounded-lg hover:bg-gray-50"
            >
              <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                {profile?.name?.charAt(0).toUpperCase() ?? "?"}
              </span>
              <span className="hidden sm:block font-medium">{profile?.name ?? "Meu perfil"}</span>
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                <Link
                  href="/configuracoes"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <Settings className="w-4 h-4" /> Configurações
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="flex flex-1 min-h-0">

          {/* ── FlatSidebar ─────────────────────────────────────────────── */}
          <aside className="w-72 shrink-0 border-r border-gray-100 bg-white flex flex-col overflow-hidden">

            <div className="px-3 py-2.5 border-b border-gray-100 shrink-0 space-y-2">
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none w-full"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 shrink-0 text-xs leading-none">×</button>
                )}
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Todos</option>
                <option value="pending_institution">Triagem</option>
                <option value="waiting">Aguardando</option>
                <option value="active">Em atendimento</option>
                <option value="closed">Encerradas</option>
              </select>
            </div>

            <div className="overflow-y-auto flex-1">
              {sortedConvs.length === 0 && (
                <p className="p-6 text-center text-xs text-gray-400">Nenhuma conversa encontrada.</p>
              )}
              {sortedConvs.map((conv) => (
                <FlatConvItem
                  key={conv.id}
                  conv={conv}
                  selected={conv.id === selected?.id}
                  onSelect={() => handleSelect(conv)}
                />
              ))}
            </div>
          </aside>

          {/* ── Chat area ────────────────────────────────────────────────── */}
          <section className="flex-1 flex min-h-0 min-w-0">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">💬</div>
                <p className="text-sm">Selecione uma conversa para atender</p>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col min-h-0">
                  <ChatView
                    conv={selected}
                    messages={messages}
                    sectorAttendants={sectorAttendants}
                    transferableSectors={transferableSectors}
                    replyText={replyText}
                    sending={sending}
                    assigning={assigning}
                    transferSectorId={transferSectorId}
                    transferring={transferring}
                    bottomRef={bottomRef}
                    showQRPicker={showQRPicker || qrTrigger}
                    qrSearch={qrTrigger ? replyText.slice(1) : qrSearch}
                    filteredQR={qrTrigger
                      ? quickReplies.filter((qr) => qr.shortcut.toLowerCase().startsWith(replyText.slice(1).toLowerCase()) || qr.title.toLowerCase().includes(replyText.slice(1).toLowerCase()))
                      : filteredQR
                    }
                    contactPanelOpen={contactPanelOpen}
                    onReplyChange={(v) => {
                      setReplyText(v);
                      if (!v.startsWith("/")) setShowQRPicker(false);
                    }}
                    onReply={handleReply}
                    onAssign={handleAssign}
                    onClose={() => setConfirmClose(true)}
                    onTransferSectorChange={setTransferSectorId}
                    onTransfer={handleTransfer}
                    onToggleQRPicker={() => { setShowQRPicker((p) => !p); setQrSearch(""); }}
                    onQrSearchChange={setQrSearch}
                    onInsertQR={insertQuickReply}
                    onToggleContactPanel={toggleContactPanel}
                  />
                </div>

                {/* ── ContactPanel ────────────────────────────────────── */}
                {contactPanelOpen && (
                  <ContactPanel
                    conv={selected}
                    onNameChange={(name) => setConversations((prev) =>
                      prev.map((c) => c.id === selected.id ? { ...c, contact_name_override: name } : c)
                    )}
                  />
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </AuthGuard>
  );
}

// ── FlatConvItem ──────────────────────────────────────────────────────────────

function FlatConvItem({ conv, selected, onSelect }: {
  conv: Conversation; selected: boolean; onSelect: () => void;
}) {
  const status = STATUS_CONFIG[conv.status] ?? { dot: "bg-gray-300", label: conv.status, badge: "bg-gray-100 text-gray-500" };
  const mins = waitingMinutes(conv.updated_at);
  const isUrgent = conv.status === "waiting" && mins >= 10;
  const name = displayName(conv);
  const attColor = conv.attendant_id ? ATTENDANT_COLORS[conv.attendant_id % ATTENDANT_COLORS.length] : "";
  const isMae = conv.institution === "mae" || conv.sector_institution === "mae";

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-3 border-b border-gray-50 transition ${
        selected ? "bg-blue-50 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 flex flex-col items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
          {isMae && <span className="text-[8px] text-pink-400">♀</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-1 mb-0.5">
            <p className="text-xs font-semibold text-gray-800 truncate">{name}</p>
            <span className={`text-[10px] font-medium shrink-0 ${isUrgent ? "text-red-500" : "text-gray-400"}`}>
              {relativeTime(conv.updated_at)}
            </span>
          </div>

          {conv.last_message && (
            <p className="text-[11px] text-gray-400 truncate">{conv.last_message}</p>
          )}

          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.badge}`}>
              {status.label}
            </span>
            {conv.attendant_name && conv.status === "active" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${attColor}`}>
                → {conv.attendant_name}
              </span>
            )}
            {conv.unread_count > 0 && (
              <span className="bg-blue-500 text-white text-[9px] font-bold min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center ml-auto">
                {conv.unread_count > 9 ? "9+" : conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── ChatView ──────────────────────────────────────────────────────────────────

function ChatView({
  conv, messages, sectorAttendants, transferableSectors, replyText, sending, assigning,
  transferSectorId, transferring, bottomRef, showQRPicker, qrSearch, filteredQR,
  contactPanelOpen,
  onReplyChange, onReply, onAssign, onClose, onTransferSectorChange, onTransfer,
  onToggleQRPicker, onQrSearchChange, onInsertQR, onToggleContactPanel,
}: {
  conv: Conversation;
  messages: Message[];
  sectorAttendants: Attendant[];
  transferableSectors: Sector[];
  replyText: string;
  sending: boolean;
  assigning: number | null;
  transferSectorId: number | null;
  transferring: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
  showQRPicker: boolean;
  qrSearch: string;
  filteredQR: QuickReply[];
  contactPanelOpen: boolean;
  onReplyChange: (v: string) => void;
  onReply: () => void;
  onAssign: (id: number) => void;
  onClose: () => void;
  onTransferSectorChange: (id: number | null) => void;
  onTransfer: () => void;
  onToggleQRPicker: () => void;
  onQrSearchChange: (v: string) => void;
  onInsertQR: (content: string) => void;
  onToggleContactPanel: () => void;
}) {
  const canReply = conv.status === "active";
  const mins = waitingMinutes(conv.updated_at);
  const isUrgent = conv.status === "waiting" && mins >= 10;
  const status = STATUS_CONFIG[conv.status];

  return (
    <>
      {/* header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{displayName(conv)}</p>
          <p className="text-xs text-gray-400 truncate">
            {conv.institution === "mae"
              ? <span className="text-pink-500 font-medium">💗 Casa da Mãe</span>
              : <span className="text-blue-500 font-medium">🏠 Casa da Criança</span>}
            {conv.sector_name && <span> · {conv.sector_emoji} {conv.sector_name}</span>}
            {conv.contact_name && <span className="text-gray-300 ml-1">· {conv.contact_phone}</span>}
          </p>
        </div>

        {/* status pill */}
        <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${status?.badge ?? "bg-gray-100 text-gray-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status?.dot ?? "bg-gray-400"}`} />
          {status?.label ?? conv.status}
        </span>

        {/* Tempo de espera */}
        {conv.status === "waiting" && (
          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
            isUrgent ? "bg-red-100 text-red-600" : "bg-amber-50 text-amber-600"
          }`}>
            <Clock className="w-3 h-3" />
            {mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h`}
          </span>
        )}

        {/* Transferir */}
        {conv.status !== "closed" && transferableSectors.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={transferSectorId ?? ""}
              onChange={(e) => onTransferSectorChange(e.target.value ? Number(e.target.value) : null)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[120px]"
            >
              <option value="">Transferir…</option>
              {transferableSectors.map((s) => (
                <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
              ))}
            </select>
            {transferSectorId && (
              <button
                onClick={onTransfer}
                disabled={transferring}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                {transferring ? "…" : "OK"}
              </button>
            )}
          </div>
        )}

        {conv.status !== "closed" && (
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition shrink-0"
          >
            <XCircle className="w-3.5 h-3.5" />
            Encerrar
          </button>
        )}

        <button
          onClick={onToggleContactPanel}
          title={contactPanelOpen ? "Fechar painel" : "Abrir painel de contato"}
          className="text-gray-400 hover:text-gray-600 transition shrink-0"
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${contactPanelOpen ? "" : "rotate-180"}`} />
        </button>
      </div>

      {/* waiting — assign banner */}
      {conv.status === "waiting" && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 shrink-0">
          <p className="text-xs font-semibold text-amber-700 mb-2">⏳ Aguardando atendente — quem vai assumir?</p>
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
                  className="flex items-center gap-2 text-xs font-medium bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  {a.avatar_url ? (
                    <img src={a.avatar_url} alt={a.name} className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-[10px]">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {assigning === a.id ? "Assumindo…" : `Assumir como ${a.name}`}
                  {a.role && <span className="text-amber-500 font-normal">· {a.role}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* active — attendant bar */}
      {conv.status === "active" && conv.attendant_name && (
        <div className="bg-green-50 border-b border-green-100 px-4 py-2 shrink-0 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-green-200 text-green-800 flex items-center justify-center font-bold text-[10px]">
            {conv.attendant_name.charAt(0).toUpperCase()}
          </span>
          <p className="text-xs text-green-700">
            <span className="font-semibold">{conv.attendant_name}</span> está atendendo
            {conv.sector_name && ` · ${conv.sector_emoji} ${conv.sector_name}`}
          </p>
        </div>
      )}

      {conv.status === "pending_institution" && (
        <div className="bg-purple-50 border-b border-purple-100 px-4 py-2 shrink-0">
          <p className="text-xs text-purple-600">🤖 Bot aguardando contato escolher a instituição.</p>
        </div>
      )}

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
        <div className="bg-white border-t border-gray-100 p-3 shrink-0 relative">
          {/* Quick replies picker */}
          {(showQRPicker) && (
            <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-hidden flex flex-col z-20">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  autoFocus
                  value={qrSearch}
                  onChange={(e) => onQrSearchChange(e.target.value)}
                  placeholder="Buscar resposta rápida…"
                  className="text-xs text-gray-700 outline-none flex-1 placeholder-gray-400"
                />
                <button onClick={() => { onQrSearchChange(""); onToggleQRPicker(); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="overflow-y-auto">
                {filteredQR.length === 0 && (
                  <p className="px-4 py-3 text-xs text-gray-400">Nenhuma resposta encontrada.</p>
                )}
                {filteredQR.map((qr) => (
                  <button
                    key={qr.id}
                    onClick={() => onInsertQR(qr.content)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-gray-800">{qr.title}</span>
                      {qr.shortcut && (
                        <code className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{qr.shortcut}</code>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 truncate">{qr.content}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 items-end">
            <button
              onClick={onToggleQRPicker}
              title="Respostas rápidas"
              className={`p-2 rounded-lg transition shrink-0 ${showQRPicker ? "bg-blue-100 text-blue-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
            >
              <Zap className="w-4 h-4" />
            </button>
            <textarea
              value={replyText}
              onChange={(e) => onReplyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onReply(); }
                if (e.key === "Escape") { onQrSearchChange(""); }
              }}
              placeholder="Digite sua resposta… (/ para respostas rápidas)"
              rows={2}
              className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={onReply}
              disabled={sending || !replyText.trim()}
              className="self-end flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition shrink-0"
            >
              <Send className="w-4 h-4" />
              {sending ? "…" : "Enviar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 text-center text-xs text-gray-400 shrink-0">
          Assuma o atendimento acima para responder
        </div>
      )}
    </>
  );
}

// ── ContactPanel ──────────────────────────────────────────────────────────────

function ContactPanel({ conv, onNameChange }: {
  conv: Conversation;
  onNameChange: (name: string) => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [nameVal, setNameVal] = useState("");
  const [notesVal, setNotesVal] = useState("");

  useEffect(() => {
    setContact(null);
    setHistory([]);
    Promise.all([getContact(conv.contact_phone), getContactHistory(conv.contact_phone)]).then(([c, h]) => {
      if (c) {
        setContact(c);
        setNameVal(c.name_override ?? "");
        setNotesVal(c.notes ?? "");
      }
      if (h) setHistory(h);
    });
  }, [conv.contact_phone]);

  const saveNameOverride = async () => {
    const val = nameVal.trim();
    await patchContact(conv.contact_phone, { name_override: val });
    onNameChange(val);
  };

  const saveNotes = async () => {
    await patchContact(conv.contact_phone, { notes: notesVal });
  };

  return (
    <aside className="w-72 shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
            {(conv.contact_name || conv.contact_phone).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {conv.contact_name_override || conv.contact_name || conv.contact_phone}
            </p>
            <p className="text-xs text-gray-400">{conv.contact_phone}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              <User className="w-3 h-3" /> Apelido / Nome salvo
            </label>
            <input
              type="text"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={saveNameOverride}
              placeholder={conv.contact_name || "Nome do contato"}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              <FileText className="w-3 h-3" /> Notas internas
            </label>
            <textarea
              value={notesVal}
              onChange={(e) => setNotesVal(e.target.value)}
              onBlur={saveNotes}
              placeholder="Observações sobre este contato…"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Histórico de atendimentos
          </p>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Nenhum atendimento anterior.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="bg-gray-50 rounded-lg px-3 py-2 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-gray-500">{h.created_at?.slice(0, 10)}</span>
                    {h.sector_name && (
                      <span className="text-gray-400">{h.sector_emoji} {h.sector_name}</span>
                    )}
                  </div>
                  {h.attendant_name && (
                    <p className="text-gray-600 font-medium">{h.attendant_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
