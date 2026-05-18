"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { getSectors, createSector, updateSector, deleteSector, type Sector } from "@/lib/api";

const EMPTY: Omit<Sector, "id"> = {
  name: "", description: "", emoji: "", menu_order: 0, active: 1,
};

export default function SetoresPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [editing, setEditing] = useState<Sector | null>(null);
  const [form, setForm] = useState<Omit<Sector, "id">>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = () => getSectors().then((s) => { if (s) setSectors(s); });
  useEffect(() => { reload(); }, []);

  const startEdit = (s: Sector) => {
    setEditing(s);
    setAdding(false);
    setForm({ name: s.name, description: s.description, emoji: s.emoji, menu_order: s.menu_order, active: s.active });
  };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setForm({ ...EMPTY, menu_order: sectors.length + 1 });
  };

  const cancel = () => { setEditing(null); setAdding(false); };

  const handleSave = async () => {
    setSaving(true);
    if (adding) {
      await createSector(form);
    } else if (editing) {
      await updateSector(editing.id, form);
    }
    setSaving(false);
    cancel();
    reload();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este setor?")) return;
    await deleteSector(id);
    reload();
  };

  const setF = (k: keyof typeof form) => (v: string | number | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          <div className="flex items-center gap-3">
            <Link href="/configuracoes" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">Setores</h1>
              <p className="text-xs text-gray-400">Gerencie os setores do menu WhatsApp</p>
            </div>
            <button
              onClick={startAdd}
              className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-2 rounded-xl hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" /> Novo Setor
            </button>
          </div>

          {/* Form (add/edit) */}
          {(adding || editing) && (
            <div className="bg-white rounded-2xl border border-blue-100 shadow p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">
                {adding ? "Novo Setor" : `Editar: ${editing?.name}`}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome</label>
                  <input
                    value={form.name}
                    onChange={(e) => setF("name")(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Financeiro"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Emoji</label>
                  <input
                    value={form.emoji}
                    onChange={(e) => setF("emoji")(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="💰"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ordem no Menu</label>
                  <input
                    type="number"
                    value={form.menu_order}
                    onChange={(e) => setF("menu_order")(Number(e.target.value))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={1}
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Descrição</label>
                  <input
                    value={form.description}
                    onChange={(e) => setF("description")(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Pagamentos, mensalidades e boletos"
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
                  disabled={saving || !form.name}
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

          {/* List */}
          <div className="space-y-2">
            {sectors.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow px-4 py-3 flex items-center gap-3">
                <span className="text-xl w-8">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800">{s.name}</p>
                  {s.description && <p className="text-xs text-gray-400 truncate">{s.description}</p>}
                </div>
                <span className="text-xs text-gray-400">#{s.menu_order}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                  {s.active ? "ativo" : "inativo"}
                </span>
                <button onClick={() => startEdit(s)} className="text-gray-400 hover:text-blue-500 transition">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(s.id)} className="text-gray-400 hover:text-red-500 transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

        </div>
      </main>
    </AuthGuard>
  );
}
