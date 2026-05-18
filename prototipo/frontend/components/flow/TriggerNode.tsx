"use client";
import { Handle, Position } from "@xyflow/react";
import { Play } from "lucide-react";
import { type FlowNodeData } from "@/lib/flowStore";

const h = "!w-4 !h-4 !border-2 !border-white !rounded-full shadow-sm";

export default function TriggerNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <div className={`bg-white border-2 rounded-xl p-3 w-44 shadow-sm transition ${selected ? "border-indigo-500 shadow-indigo-100 shadow-md" : "border-indigo-300"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Play className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="text-xs font-semibold text-indigo-700 truncate">{data.label}</span>
      </div>
      {data.content && <p className="text-xs text-gray-400 truncate">{data.content}</p>}
      <Handle type="source" position={Position.Right} className={`${h} !bg-indigo-500`} />
    </div>
  );
}
