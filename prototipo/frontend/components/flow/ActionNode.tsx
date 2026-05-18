"use client";
import { Handle, Position } from "@xyflow/react";
import { Zap, MessageSquare, FileText, Table2, AlertTriangle, X } from "lucide-react";
import { type FlowNodeData, useFlowStore } from "@/lib/flowStore";

const actionMeta = {
  whatsapp:     { icon: MessageSquare, color: "green",  label: "WhatsApp" },
  generate_doc: { icon: FileText,      color: "purple", label: "Gerar .docx" },
  update_sheet: { icon: Table2,        color: "teal",   label: "Google Sheets" },
  fallback:     { icon: AlertTriangle, color: "red",    label: "Fallback Humano" },
} as const;

const colorMap = {
  green:  { border: "border-green-300",  selected: "border-green-500",  icon: "text-green-500",  badge: "text-green-700"  },
  purple: { border: "border-purple-300", selected: "border-purple-500", icon: "text-purple-500", badge: "text-purple-700" },
  teal:   { border: "border-teal-300",   selected: "border-teal-500",   icon: "text-teal-500",   badge: "text-teal-700"   },
  red:    { border: "border-red-300",    selected: "border-red-500",    icon: "text-red-500",    badge: "text-red-700"    },
  gray:   { border: "border-gray-300",   selected: "border-gray-500",   icon: "text-gray-500",   badge: "text-gray-700"   },
};

const h = "!w-4 !h-4 !border-2 !border-white !rounded-full shadow-sm";

export default function ActionNode({ id, data, selected }: { id: string; data: FlowNodeData; selected?: boolean }) {
  const deleteNode = useFlowStore((s) => s.deleteNode);
  const meta = data.actionType ? actionMeta[data.actionType] : null;
  const color = meta ? colorMap[meta.color] : colorMap.gray;
  const Icon = meta?.icon ?? Zap;

  return (
    <div className={`bg-white border-2 rounded-xl p-3 w-44 shadow-sm transition ${selected ? `${color.selected} shadow-md` : color.border}`}>
      <Handle type="target" position={Position.Left} className={`${h} !bg-gray-400`} />
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 shrink-0 ${color.icon}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">{data.label}</p>
          {meta && <p className={`text-xs ${color.badge}`}>{meta.label}</p>}
        </div>
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
            className="text-gray-300 hover:text-red-500 transition shrink-0"
            title="Excluir nó"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} className={`${h} !bg-gray-400`} />
    </div>
  );
}
