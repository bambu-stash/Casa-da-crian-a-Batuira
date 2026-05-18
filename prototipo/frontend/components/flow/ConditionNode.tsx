"use client";
import { Handle, Position } from "@xyflow/react";
import { GitBranch, X } from "lucide-react";
import { type FlowNodeData, useFlowStore } from "@/lib/flowStore";

const h = "!w-4 !h-4 !border-2 !border-white !rounded-full shadow-sm";

export default function ConditionNode({ id, data, selected }: { id: string; data: FlowNodeData; selected?: boolean }) {
  const deleteNode = useFlowStore((s) => s.deleteNode);
  return (
    <div className={`bg-white border-2 rounded-xl p-3 w-52 shadow-sm transition ${selected ? "border-amber-500 shadow-amber-100 shadow-md" : "border-amber-300"}`}>
      <Handle type="target" position={Position.Left} className={`${h} !bg-amber-400`} />
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-700 truncate flex-1">{data.label}</span>
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
      {data.conditionField && (
        <p className="text-xs text-gray-400">
          <span className="font-mono bg-gray-100 px-1 rounded">{data.conditionField}</span>
          {" = "}
          <span className="font-mono bg-gray-100 px-1 rounded">{data.conditionValue}</span>
        </p>
      )}
      <div className="flex flex-col items-end gap-1 mt-1 -mr-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-green-600 font-medium">Sim</span>
          <Handle type="source" position={Position.Right} id="yes" className={`${h} !bg-green-500 !relative !transform-none`} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-red-500 font-medium">Não</span>
          <Handle type="source" position={Position.Right} id="no" className={`${h} !bg-red-500 !relative !transform-none`} />
        </div>
      </div>
    </div>
  );
}
