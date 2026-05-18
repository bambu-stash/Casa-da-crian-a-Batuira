"use client";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useFlowStore } from "@/lib/flowStore";

export default function DeletableEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style, markerEnd, label,
}: EdgeProps) {
  const deleteEdge = useFlowStore((s) => s.deleteEdge);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan group flex items-center gap-1"
        >
          {label && (
            <span className="text-[10px] bg-white border border-gray-200 rounded px-1 text-gray-500 shadow-sm">
              {label}
            </span>
          )}
          <button
            onClick={() => deleteEdge(id)}
            className="opacity-0 group-hover:opacity-100 w-4 h-4 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow transition-opacity"
            title="Remover conexão"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
