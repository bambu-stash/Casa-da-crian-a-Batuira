"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X, AlertCircle } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getAttendants, createAttendant, updateAttendant, deleteAttendant, getSectors,
  type Attendant, type Sector,
} from "@/lib/api";

type AttendantForm = Omit<Attendant, "id" | "sector_name">;

const EMPTY_FORM: AttendantForm = {
  name: "", sector_id: 0, whatsapp_number: "", email: "",
  active: 1, role: "", avatar_url: "", bio: "",
};

function isValidWhatsApp(n: string) {
  if (!n) return true;
  return /^\d{10,15}$/.test(n.replace(/\D/g, ""));
}

export default function AtendentesPage() {
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [editing, setEditing] = useState<Attendant | null>(null);
  const [form, setForm] = useState<AttendantForm>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attendant | null>(null);

  const reload = async () => {
    const [a, s] = await Promise.all([getAttendants(), getSectors()]);
    if (a) setAttendants(a);
    if (s) setSectors(s);
  };

  useEffect(() => { reload(); }, []);

  const startEdit = (a: Attendant) => {
    setEditing(a);
    setAdding(false);
    setError(null);
    setForm({
      name: a.name, sector_id: a.sector_id,
      whatsapp_number: a.whatsapp_number, email: a.email, active: a.active,
      role: a.role ?? "", avatar_url: a.avatar_url ?? "", bio: a.bio ?? "",
    });
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setError(null);
    setForm({ ...EMPTY_FORM, sector_id: sectors[0]?.id ?? 0 });
  };

  const cancel = () => { setEditing(null); setAdding(false); setError(null); };

  const handleSave = async () => {
    if (!isValidWhatsApp(form.whatsapp_number)) {
      setError("Número de WhatsApp inválido. Use apenas dígitos (10–15 números), ex: 5511999990000");
      return;
    }
    setSaving(true);
    setError(null);
    const result = adding
      ? await createAttendant(form)
      : editing ? await updateAttendant(editing.id, form) : null;
    setSaving(false);
    if (!result) {
      setError("Não foi possível salvar. Verifique os dados e tente novamente.");
      return;
    }
    cancel();
    reload();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteAttendant(deleteTarget.id);
    setDeleteTarget(null);
    reload();
  };

  const setF = (k: keyof AttendantForm) => (v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const waInvalid = form.whatsapp_number ? !isValidWhatsApp(form.whatsapp_number) : false;

  const criancaSectors = sectors.filter((s) => s.institution !== "mae");
  const maeSectors     = sectors.filter((s) => s.institution === "mae");

  const bySector = (list: typeof sectors) => list.map((s) => ({
    sector: s,
    members: attendants.filter((a) => a.sector_id === s.id),
  }));

  return (
    <AuthGuard>
      {deleteTarget && (
        <ConfirmDialog
          title={`Remover ${deleteTarget.name}?`}
          message="Este atendente será removido permanentemente e não poderá mais receber conversas."
          confirmLabel="Remover"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          <div className="flex items-center gap-3">
            <Link href="/configuracoes" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">Atendentes</h1>
              <p className="text-xs text-gray-400">Gerencie quem atende cada setor</p>
            </div>
            <button
              onClick={startAdd}
              className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-2 rounded-xl hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" /> Novo Atendente
            </button>
          </div>

          {/* Form */}
          {(adding || editing) && (
            <div className="bg-white rounded-2xl border border-blue-100 shadow p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">
                {adding ? "Novo Atendente" : `Editar: ${editing?.name}`}
              </h2>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Avatar preview */}
              <div className="flex items-center gap-3">
                <Avatar url={form.avatar_url} name={form.name || "?"} size={10} />
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">URL da Foto</label>
                  <input
                    value={form.avatar_url}
                    onChange={(e) => setF("avatar_url")(e.target.value)}
                    placeholder="https://exemplo.com/foto.jpg"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome</label>
                  <input
                    value={form.name}
                    onChange={(e) => setF("name")(e.target.value)}
                    placeholder="Ex: Jessica"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cargo / Função</label>
                  <input
                    value={form.role}
                    onChange={(e) => setF("role")(e.target.value)}
                    placeholder="Ex: Recepcionista, Coordenadora, Assistente Social"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Setor</label>
                  <select
                    value={form.sector_id}
                    onChange={(e) => setF("sector_id")(Number(e.target.value))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value={0} disabled>Selecione um setor…</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">WhatsApp</label>
                  <input
                    value={form.whatsapp_number}
                    onChange={(e) => setF("whatsapp_number")(e.target.value)}
                    placeholder="5511999990000"
                    className={`border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 font-mono ${waInvalid ? "border-red-300 focus:ring-red-400" : "border-gray-200 focus:ring-blue-500"}`}
                  />
                  {waInvalid && <span className="text-[11px] text-red-500">Use apenas dígitos, ex: 5511999990000</span>}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setF("email")(e.target.value)}
                    placeholder="jessica@batuira.org"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bio</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setF("bio")(e.target.value)}
                    placeholder="Breve descrição sobre o atendente…"
                    rows={2}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ativo</label>
                  <button
                    type="button"
                    onClick={() => setF("active")(form.active ? 0 : 1)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${form.active ? "bg-blue-600" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? "translate-x-5" : ""}`} />
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.sector_id || waInvalid}
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
                >
                  <Save className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar"}
                </button>
                <button onClick={cancel} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 px-3 py-2 text-sm">
                  <X className="w-4 h-4" /> Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Casa da Criança */}
          {criancaSectors.length > 0 && (
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">🏠 Casa da Criança Batuira</p>
              {bySector(criancaSectors).map(({ sector, members }) => (
                <SectorBlock key={sector.id} sector={sector} members={members} onEdit={startEdit} onDelete={(a) => setDeleteTarget(a)} />
              ))}
            </div>
          )}

          {/* Casa da Mãe */}
          {maeSectors.length > 0 && (
            <div>
              <p className="text-xs font-bold text-pink-600 uppercase tracking-wider mb-2">💗 Casa da Mãe Batuira</p>
              {bySector(maeSectors).map(({ sector, members }) => (
                <SectorBlock key={sector.id} sector={sector} members={members} onEdit={startEdit} onDelete={(a) => setDeleteTarget(a)} isMae />
              ))}
            </div>
          )}

        </div>
      </main>
    </AuthGuard>
  );
}

function Avatar({ url, name, size = 8 }: { url: string; name: string; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm shrink-0`;
  if (url) {
    return <img src={url} alt={name} className={`w-${size} h-${size} rounded-full object-cover shrink-0`} />;
  }
  return <div className={cls}>{name.charAt(0).toUpperCase()}</div>;
}

function SectorBlock({
  sector, members, onEdit, onDelete, isMae,
}: {
  sector: Sector;
  members: Attendant[];
  onEdit: (a: Attendant) => void;
  onDelete: (a: Attendant) => void;
  isMae?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow overflow-hidden mb-3 ${isMae ? "border-pink-100" : "border-gray-100"}`}>
      <div className={`px-4 py-3 border-b flex items-center gap-2 ${isMae ? "bg-pink-50 border-pink-100" : "bg-gray-50 border-gray-100"}`}>
        <span className="text-base">{sector.emoji}</span>
        <p className={`font-semibold text-sm ${isMae ? "text-pink-800" : "text-gray-700"}`}>{sector.name}</p>
        <span className={`text-xs ${isMae ? "text-pink-400" : "text-gray-400"}`}>
          ({members.length} atendente{members.length !== 1 ? "s" : ""})
        </span>
      </div>
      {members.length === 0 ? (
        <p className={`px-4 py-4 text-xs italic ${isMae ? "text-pink-300" : "text-gray-400"}`}>Nenhum atendente cadastrado.</p>
      ) : (
        members.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
            <Avatar url={a.avatar_url} name={a.name} size={8} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{a.name}</p>
              {a.role && <p className="text-xs text-blue-500">{a.role}</p>}
              <p className="text-xs text-gray-400 truncate">{a.email || a.whatsapp_number || "—"}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
              {a.active ? "ativo" : "inativo"}
            </span>
            <button onClick={() => onEdit(a)} className="text-gray-400 hover:text-blue-500 transition">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => onDelete(a)} className="text-gray-400 hover:text-red-500 transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
