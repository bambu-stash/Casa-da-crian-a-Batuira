"use client";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useFlowStore, type NodeKind } from "@/lib/flowStore";
import MessageNode    from "@/components/flow/MessageNode";
import ConditionNode  from "@/components/flow/ConditionNode";
import ActionNode     from "@/components/flow/ActionNode";
import TriggerNode    from "@/components/flow/TriggerNode";
import DeletableEdge  from "@/components/flow/DeletableEdge";
import NodeInspector  from "@/components/flow/NodeInspector";
import { Plus, RotateCcw, ArrowLeft } from "lucide-react";
import Link from "next/link";

const nodeTypes = {
  messageNode:   MessageNode,
  conditionNode: ConditionNode,
  actionNode:    ActionNode,
  triggerNode:   TriggerNode,
} as unknown as NodeTypes;

const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
};

const ADD_BUTTONS: { kind: NodeKind; label: string; color: string }[] = [
  { kind: "message",   label: "Mensagem",  color: "bg-blue-500 hover:bg-blue-600" },
  { kind: "condition", label: "Condição",  color: "bg-amber-500 hover:bg-amber-600" },
  { kind: "action",    label: "Ação",      color: "bg-green-600 hover:bg-green-700" },
];

const defaultEdgeOptions = {
  type: "deletable" as const,
  style: { stroke: "#94a3b8", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
};

export default function FlowPage() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, reset } =
    useFlowStore();

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Toolbar */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b shadow-sm z-10">
        <Link href="/" className="text-gray-400 hover:text-gray-600 transition">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-sm font-semibold text-gray-700">Editor de Fluxo</h1>
        <div className="flex-1" />

        {ADD_BUTTONS.map(({ kind, label, color }) => (
          <button
            key={kind}
            onClick={() => addNode(kind)}
            className={`flex items-center gap-1 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition ${color}`}
          >
            <Plus className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}

        <button
          onClick={reset}
          className="flex items-center gap-1 text-gray-500 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-100 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Resetar
        </button>
      </header>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2, strokeDasharray: "6 3" }}
          fitView
          deleteKeyCode={null}
          edgesFocusable
        >
          <Background gap={20} color="#e5e7eb" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const kind = (n.data as any)?.kind;
              return kind === "trigger" ? "#6366f1"
                : kind === "message"   ? "#3b82f6"
                : kind === "condition" ? "#f59e0b"
                : "#22c55e";
            }}
            className="!bg-white !border !border-gray-200 !rounded-xl"
          />

          <Panel position="bottom-left">
            <div className="bg-white/90 backdrop-blur rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-400 shadow-sm select-none">
              Arraste um <span className="font-bold text-gray-600">●</span> para conectar
              {" · "}Clique para editar
              {" · "}Passe o mouse na seta para remover
            </div>
          </Panel>
        </ReactFlow>

        <NodeInspector />
      </div>
    </div>
  );
}
