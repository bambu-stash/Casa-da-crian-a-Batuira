"use client";
import { Handle, Position } from "@xyflow/react";
import { MessageSquare, X } from "lucide-react";
import { type FlowNodeData, useFlowStore } from "@/lib/flowStore";

const h = "!w-4 !h-4 !border-2 !border-white !rounded-full shadow-sm";

export default function MessageNode({ id, data, selected }: { id: string; data: FlowNodeData; selected?: boolean }) {
  const deleteNode = useFlowStore((s) => s.deleteNode);
  return (
    <div className={`bg-white border-2 rounded-xl p-3 w-52 shadow-sm transition ${selected ? "border-blue-500 shadow-blue-100 shadow-md" : "border-blue-200"}`}>
      <Handle type="target" position={Position.Left} className={`${h} !bg-blue-500`} />
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-xs font-semibold text-blue-700 truncate flex-1">{data.label}</span>
        {selected && (
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
            className="text-gray-300 hover:text-red-500 transition ml-auto"
            title="Excluir nó"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 leading-snug line-clamp-3 whitespace-pre-wrap">{data.content}</p>
      <Handle type="source" position={Position.Right} className={`${h} !bg-blue-500`} />
    </div>
  );
}
