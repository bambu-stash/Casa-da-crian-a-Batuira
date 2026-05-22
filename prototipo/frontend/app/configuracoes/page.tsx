"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Save, CheckCircle, XCircle, Copy, Check,
  Bot, Webhook, KeyRound, Eye, EyeOff, Users, LayoutGrid, Key,
  QrCode, X, RefreshCw,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { getSettings, updateSettings, healthCheck, getQRCode, type BotSettings, type HealthData, type QRCodeData } from "@/lib/api";

const WEBHOOK_PATH = "/api/whatsapp/webhook";

function StatusDot({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
}

function Field({ label, name, value, onChange, placeholder = "", hint = "" }: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <input
        type="text" name={name} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function SecretField({ label, name, value, onChange, placeholder }: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"} name={name} value={value}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          autoComplete="off"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono"
        />
        <button type="button" onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const [form, setForm] = useState<Partial<BotSettings>>({
    org_name: "", bot_enabled: true, bot_fallback_phone: "",
  });
  const [health, setHealth] = useState<HealthData | null>(null);
  const [apiKeys, setApiKeys] = useState({ evolution_api_key: "", evolution_api_url: "", evolution_instance: "" });
  const [masks, setMasks] = useState({ evolution_api_key: "", evolution_api_url: "", evolution_instance: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [serverUrl, setServerUrl] = useState("http://SEU-SERVIDOR:8000");
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState<QRCodeData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");

  const openQR = async () => {
    setShowQR(true);
    setQrData(null);
    setQrError("");
    setQrLoading(true);
    const data = await getQRCode();
    setQrLoading(false);
    if (!data || !data.base64) {
      setQrError("Não foi possível obter o QR code. Verifique se a Evolution API está configurada e acessível.");
    } else {
      setQrData(data);
    }
  };

  const refreshQR = async () => {
    setQrData(null);
    setQrError("");
    setQrLoading(true);
    const data = await getQRCode();
    setQrLoading(false);
    if (!data || !data.base64) {
      setQrError("Não foi possível obter o QR code.");
    } else {
      setQrData(data);
    }
  };

  useEffect(() => {
    getSettings().then((s) => {
      if (!s) return;
      setForm({ org_name: s.org_name, bot_enabled: s.bot_enabled, bot_fallback_phone: s.bot_fallback_phone });
      setMasks({
        evolution_api_key: s.evolution_api_key ?? "",
        evolution_api_url: s.evolution_api_url ?? "",
        evolution_instance: s.evolution_instance ?? "",
      });
    });
    healthCheck().then(setHealth);
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      setServerUrl(h === "localhost" ? "http://localhost:8000" : `${window.location.protocol}//${h}:8000`);
    }
  }, []);

  const webhookUrl = `${serverUrl}${WEBHOOK_PATH}`;
  const setKey = (k: keyof typeof apiKeys) => (v: string) => setApiKeys((a) => ({ ...a, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const patch: Partial<BotSettings> = { ...form };
    if (apiKeys.evolution_api_key) patch.evolution_api_key = apiKeys.evolution_api_key;
    if (apiKeys.evolution_api_url) patch.evolution_api_url = apiKeys.evolution_api_url;
    if (apiKeys.evolution_instance) patch.evolution_instance = apiKeys.evolution_instance;
    const result = await updateSettings(patch);
    setSaving(false);
    if (result) {
      setForm({ org_name: result.org_name, bot_enabled: result.bot_enabled, bot_fallback_phone: result.bot_fallback_phone });
      setMasks({
        evolution_api_key: result.evolution_api_key ?? "",
        evolution_api_url: result.evolution_api_url ?? "",
        evolution_instance: result.evolution_instance ?? "",
      });
      setApiKeys({ evolution_api_key: "", evolution_api_url: "", evolution_instance: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const svc = health?.services;

  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-4 h-4" /></Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
              <p className="text-xs text-gray-400">Batuira Bot — Casa da Criança Batuira</p>
            </div>
          </div>

          {/* Atalhos */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { href: "/configuracoes/setores", icon: <LayoutGrid className="w-5 h-5" />, label: "Setores", desc: "Menu WhatsApp" },
              { href: "/configuracoes/atendentes", icon: <Users className="w-5 h-5" />, label: "Atendentes", desc: "Quem atende" },
              { href: "/configuracoes/api", icon: <Key className="w-5 h-5" />, label: "Acesso à API", desc: "Chaves externas" },
            ].map(({ href, icon, label, desc }) => (
              <Link
                key={href} href={href}
                className="bg-white rounded-2xl border border-gray-100 shadow p-4 flex flex-col gap-2 hover:border-blue-200 hover:shadow-md transition"
              >
                <div className="text-blue-600">{icon}</div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400">{desc}</p>
              </Link>
            ))}
          </div>

          {/* Status das APIs */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-gray-400" /> Status das Integrações
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Evolution API", ok: svc?.evolution_api === "configured" },
              ].map(({ label, ok }) => (
                <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  <StatusDot ok={!!ok} />
                  <span className="font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chaves de API */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow p-5 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700">Chaves de Integração</h2>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              Deixe em branco para manter a chave atual.
            </p>
            <SecretField label="Evolution API Key" name="evolution_api_key"
              value={apiKeys.evolution_api_key} onChange={setKey("evolution_api_key")}
              placeholder={masks.evolution_api_key || "Chave atual mascarada"} />
            <Field label="Evolution API URL" name="evolution_api_url"
              value={apiKeys.evolution_api_url} onChange={setKey("evolution_api_url")}
              placeholder={masks.evolution_api_url || "http://localhost:8080"} />
            <Field label="Evolution Instance" name="evolution_instance"
              value={apiKeys.evolution_instance} onChange={setKey("evolution_instance")}
              placeholder={masks.evolution_instance || "batuira"} />
          </div>

          {/* Dados da Organização */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Organização</h2>
            <Field label="Nome da Organização" name="org_name"
              value={form.org_name ?? ""} onChange={(v) => setForm((f) => ({ ...f, org_name: v }))}
              placeholder="Casa da Criança Batuira" />
          </div>

          {/* Bot */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Bot className="w-4 h-4 text-gray-400" /> Bot WhatsApp
            </h2>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-gray-700">Bot ativo</p>
                <p className="text-xs text-gray-400">Responde e direciona mensagens automaticamente</p>
              </div>
              <button
                onClick={() => setForm((f) => ({ ...f, bot_enabled: !f.bot_enabled }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.bot_enabled ? "bg-blue-600" : "bg-gray-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.bot_enabled ? "translate-x-5" : ""}`} />
              </button>
            </div>
            <Field label="Telefone de Fallback" name="bot_fallback_phone"
              value={form.bot_fallback_phone ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, bot_fallback_phone: v }))}
              placeholder="5511999990000"
              hint="Alerta enviado quando não há atendente disponível." />
          </div>

          {/* Parear WhatsApp */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-gray-400" /> Parear WhatsApp
            </h2>
            <p className="text-xs text-gray-400">
              Gera o QR code da instância Evolution API para conectar o número de WhatsApp.
            </p>
            <button
              onClick={openQR}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition"
            >
              <QrCode className="w-4 h-4" />
              Conectar via QR Code
            </button>
          </div>

          {/* Webhook URL */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Webhook className="w-4 h-4 text-gray-400" /> URL do Webhook
            </h2>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <code className="flex-1 text-xs text-gray-700 break-all font-mono">{webhookUrl}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="shrink-0 text-gray-400 hover:text-gray-600"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Evolution API: <strong>Settings → Webhooks → URL</strong>, evento{" "}
              <code className="font-mono">messages.upsert</code>.
            </p>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pb-4">
            <button
              onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando…" : "Salvar Configurações"}
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" /> Salvo!
              </span>
            )}
          </div>

        </div>
      </main>

      {/* Modal QR Code */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-green-600" /> Parear WhatsApp
              </h3>
              <button onClick={() => setShowQR(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {qrLoading && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Buscando QR code…</p>
              </div>
            )}

            {qrError && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
                {qrError}
              </div>
            )}

            {qrData && (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={qrData.base64}
                  alt="QR Code WhatsApp"
                  className="w-56 h-56 rounded-xl border border-gray-200"
                />
                {qrData.pairing_code && (
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">Código de emparelhamento</p>
                    <code className="text-lg font-mono font-bold text-gray-800 tracking-widest">
                      {qrData.pairing_code}
                    </code>
                  </div>
                )}
                <p className="text-xs text-gray-400 text-center">
                  Abra o WhatsApp → Aparelhos conectados → Conectar aparelho
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              {!qrLoading && (
                <button
                  onClick={refreshQR}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                </button>
              )}
              <button
                onClick={() => setShowQR(false)}
                className="text-sm bg-gray-100 text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-200 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
