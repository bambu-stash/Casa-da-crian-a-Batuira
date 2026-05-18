"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import {
  getAttendants, createAttendant, updateAttendant, deleteAttendant, getSectors,
  type Attendant, type Sector,
} from "@/lib/api";

type AttendantForm = Omit<Attendant, "id" | "sector_name">;

const EMPTY_FORM: AttendantForm = {
  name: "", sector_id: 0, whatsapp_number: "", email: "", active: 1,
};

export default function AtendentesPage() {
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [editing, setEditing] = useState<Attendant | null>(null);
  const [form, setForm] = useState<AttendantForm>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const [a, s] = await Promise.all([getAttendants(), getSectors()]);
    if (a) setAttendants(a);
    if (s) setSectors(s);
  };

  useEffect(() => { reload(); }, []);

  const startEdit = (a: Attendant) => {
    setEditing(a);
    setAdding(false);
    setForm({
      name: a.name, sector_id: a.sector_id,
      whatsapp_number: a.whatsapp_number, email: a.email, active: a.active,
    });
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setForm({ ...EMPTY_FORM, sector_id: sectors[0]?.id ?? 0 });
  };

  const cancel = () => { setEditing(null); setAdding(false); };

  const handleSave = async () => {
    setSaving(true);
    if (adding) {
      await createAttendant(form);
    } else if (editing) {
      await updateAttendant(editing.id, form);
    }
    setSaving(false);
    cancel();
    reload();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este atendente?")) return;
    await deleteAttendant(id);
    reload();
  };

  const setF = (k: keyof AttendantForm) => (v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const bySector = sectors.map((s) => ({
    sector: s,
    members: attendants.filter((a) => a.sector_id === s.id),
  }));

  return (
    <AuthGuard>
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
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Setor</label>
                  <select
                    value={form.sector_id}
                    onChange={(e) => setF("sector_id")(Number(e.target.value))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
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
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
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
                  disabled={saving || !form.name || !form.sector_id}
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

          {/* Grouped by sector */}
          {bySector.map(({ sector, members }) => (
            <div key={sector.id} className="bg-white rounded-2xl border border-gray-100 shadow overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span className="text-base">{sector.emoji}</span>
                <p className="font-semibold text-gray-700 text-sm">{sector.name}</p>
                <span className="text-xs text-gray-400">({members.length} atendente{members.length !== 1 ? "s" : ""})</span>
              </div>
              {members.length === 0 ? (
                <p className="px-4 py-4 text-xs text-gray-400">Nenhum atendente cadastrado.</p>
              ) : (
                members.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{a.name}</p>
                      <p className="text-xs text-gray-400 truncate">{a.email || a.whatsapp_number || "—"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {a.active ? "ativo" : "inativo"}
                    </span>
                    <button onClick={() => startEdit(a)} className="text-gray-400 hover:text-blue-500 transition">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="text-gray-400 hover:text-red-500 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}

        </div>
      </main>
    </AuthGuard>
  );
}
