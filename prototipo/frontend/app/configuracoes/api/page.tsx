"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Copy, Check, Key, AlertTriangle } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { getApiKeys, createApiKey, revokeApiKey, type ApiKey } from "@/lib/api";

export default function ApiAccessPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = () => getApiKeys().then((k) => { if (k) setKeys(k); });
  useEffect(() => { reload(); }, []);

  const handleCreate = async () => {
    if (!name || !email) return;
    setCreating(true);
    const result = await createApiKey({ name, user_email: email });
    setCreating(false);
    if (result?.key) {
      setNewKey(result.key);
      setName("");
      setEmail("");
      reload();
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Revogar esta chave? Ela perderá acesso imediatamente.")) return;
    await revokeApiKey(id);
    reload();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          <div className="flex items-center gap-3">
            <Link href="/configuracoes" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Acesso à API</h1>
              <p className="text-xs text-gray-400">Gere chaves para integração com sistemas externos</p>
            </div>
          </div>

          {/* Como usar */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
              <Key className="w-4 h-4" /> Como usar
            </h2>
            <p className="text-xs text-blue-700">
              Inclua a chave no cabeçalho das requisições:
            </p>
            <code className="block text-xs bg-blue-100 text-blue-900 px-3 py-2 rounded-lg font-mono">
              Authorization: Bearer btr_xxxxxxxxxxxxxxxx…
            </code>
            <p className="text-xs text-blue-600">
              Ou use o header <code className="font-mono">X-API-Key: btr_…</code>
            </p>
          </div>

          {/* Alerta chave nova */}
          {newKey && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Copie sua chave agora!</p>
                  <p className="text-xs text-amber-600 mt-0.5">Ela não será exibida novamente.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2">
                <code className="flex-1 text-xs font-mono text-gray-800 break-all">{newKey}</code>
                <button
                  onClick={() => handleCopy(newKey)}
                  className="shrink-0 text-amber-600 hover:text-amber-800"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={() => setNewKey(null)}
                className="text-xs text-amber-600 hover:text-amber-800 underline"
              >
                Já copiei, fechar
              </button>
            </div>
          )}

          {/* Gerar nova chave */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Gerar Nova Chave</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome / Descrição</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Integração Zapier"
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">E-mail responsável</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jessica@batuira.org"
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !name || !email}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
            >
              <Plus className="w-4 h-4" />
              {creating ? "Gerando…" : "Gerar Chave"}
            </button>
          </div>

          {/* Keys list */}
          <div className="space-y-2">
            {keys.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">Nenhuma chave gerada.</p>
            )}
            {keys.map((k) => (
              <div key={k.id} className={`bg-white rounded-2xl border shadow px-4 py-3 flex items-center gap-3 ${k.active ? "border-gray-100" : "border-gray-50 opacity-60"}`}>
                <Key className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{k.name}</p>
                  <p className="text-xs text-gray-400">{k.user_email}</p>
                  <p className="text-xs font-mono text-gray-300 mt-0.5">{k.key_prefix}</p>
                </div>
                <div className="text-right text-xs text-gray-400 shrink-0">
                  <p>Criada {k.created_at?.slice(0, 10)}</p>
                  {k.last_used_at && <p>Usada {k.last_used_at?.slice(0, 10)}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${k.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                  {k.active ? "ativa" : "revogada"}
                </span>
                {k.active && (
                  <button
                    onClick={() => handleRevoke(k.id)}
                    className="text-gray-400 hover:text-red-500 transition shrink-0"
                    title="Revogar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

        </div>
      </main>
    </AuthGuard>
  );
}
