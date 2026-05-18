"use client";
import { type HealthData } from "@/lib/api";

const LABELS: Record<string, string> = {
  google_oauth:  "Google OAuth",
  evolution_api: "Evolution API",
  anthropic:     "Anthropic (Claude)",
};

export default function ServiceStatus({ health }: { health: HealthData | null }) {
  if (!health) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
        Backend desconectado — inicie o servidor Python.
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Status dos Serviços</p>
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(health.services).map(([key, val]) => {
          const ok = val === "configured";
          return (
            <div key={key} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-green-500" : "bg-red-400"}`} />
              <span className="text-sm text-gray-600">{LABELS[key] ?? key}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
