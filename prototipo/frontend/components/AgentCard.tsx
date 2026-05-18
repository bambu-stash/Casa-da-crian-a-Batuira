"use client";
import { clsx } from "clsx";

type Status = "online" | "offline" | "processing";

interface AgentCardProps {
  name: string;
  description: string;
  status: Status;
  onToggle?: () => void;
}

const statusConfig: Record<Status, { label: string; dot: string }> = {
  online: { label: "Ligado", dot: "bg-green-500" },
  offline: { label: "Desligado", dot: "bg-gray-400" },
  processing: { label: "Processando", dot: "bg-yellow-400 animate-pulse" },
};

export default function AgentCard({ name, description, status, onToggle }: AgentCardProps) {
  const { label, dot } = statusConfig[status];

  return (
    <div className="bg-white rounded-2xl shadow p-5 flex flex-col gap-3 border border-gray-100">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{name}</h3>
        <span className="flex items-center gap-1.5 text-sm text-gray-500">
          <span className={clsx("w-2.5 h-2.5 rounded-full", dot)} />
          {label}
        </span>
      </div>
      <p className="text-sm text-gray-500">{description}</p>
      {onToggle && (
        <button
          onClick={onToggle}
          className={clsx(
            "mt-1 self-start text-xs px-3 py-1.5 rounded-lg font-medium transition",
            status === "online"
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-green-50 text-green-700 hover:bg-green-100"
          )}
        >
          {status === "online" ? "Desligar" : "Ligar"}
        </button>
      )}
    </div>
  );
}
