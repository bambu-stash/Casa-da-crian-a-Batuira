"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X, Zap } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply,
  type QuickReply,
} from "@/lib/api";

type QRForm = { title: string; content: string; shortcut: string; active: boolean };
const EMPTY_FORM: QRForm = { title: "", content: "", shortcut: "", active: true };

export default function RespostasRapidasPage() {
  const [items, setItems]         = useState<QuickReply[]>([]);
  const [editing, setEditing]     = useState<QuickReply | null>(null);
  const [form, setForm]           = useState<QRForm>(EMPTY_FORM);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuickReply | null>(null);

  const load = async () => {
    const data = await getQuickReplies();
    if (data) setItems(data);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (qr: QuickReply) => {
    setEditing(qr);
    setForm({ title: qr.title, content: qr.content, shortcut: qr.shortcut, active: !!qr.active });
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    const payload = { title: form.title, content: form.content, shortcut: form.shortcut, active: form.active };
    if (editing) {
      await updateQuickReply(editing.id, payload);
    } else {
      await createQuickReply(payload);
    }
    setSaving(false);
    cancel();
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteQuickReply(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  return (
    <AuthGuard>
      {deleteTarget && (
        <ConfirmDialog
          title="Excluir resposta rápida?"
          message={`Excluir "${deleteTarget.title}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
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
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-600" /> Respostas Rápidas
              </h1>
              <p className="text-xs text-gray-400">Frases prontas para agilizar o atendimento</p>
            </div>
            <button
              onClick={openNew}
              className="ml-auto flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4" /> Nova resposta
            </button>
          </div>

          {/* Form */}
          {showForm && (
            <div className="bg-white rounded-2xl border border-blue-200 shadow p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700">
                {editing ? "Editar resposta" : "Nova resposta rápida"}
              </h2>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Título *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Saudação inicial"
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Atalho</label>
                <input
                  type="text"
                  value={form.shortcut}
                  onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))}
                  placeholder="/saudacao"
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-gray-400">Digite / seguido de um atalho para acesso rápido no chat.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Conteúdo *</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Texto da resposta que será inserido no chat…"
                  rows={4}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                    className={`relative w-9 h-5 rounded-full transition-colors ${form.active ? "bg-blue-600" : "bg-gray-200"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? "translate-x-4" : ""}`} />
                  </button>
                  Ativa
                </label>

                <div className="flex gap-2">
                  <button onClick={cancel} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">
                    <X className="w-4 h-4" /> Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.title.trim() || !form.content.trim()}
                    className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div className="space-y-3">
            {items.length === 0 && !showForm && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow p-8 text-center text-gray-400 space-y-2">
                <Zap className="w-8 h-8 mx-auto text-gray-200" />
                <p className="text-sm">Nenhuma resposta rápida criada.</p>
                <p className="text-xs">Crie atalhos para as frases mais usadas no atendimento.</p>
              </div>
            )}
            {items.map((qr) => (
              <div key={qr.id} className="bg-white rounded-2xl border border-gray-100 shadow p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-800">{qr.title}</span>
                      {qr.shortcut && (
                        <code className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-mono">{qr.shortcut}</code>
                      )}
                      {!qr.active && (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded">Inativa</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 whitespace-pre-wrap line-clamp-3">{qr.content}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(qr)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(qr)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </AuthGuard>
  );
}
