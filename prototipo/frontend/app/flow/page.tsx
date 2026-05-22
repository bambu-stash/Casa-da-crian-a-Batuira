"use client";
import { useState, useEffect, useRef } from "react";
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
import { Plus, RotateCcw, ArrowLeft, Upload, Download } from "lucide-react";
import Link from "next/link";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getFlow, saveFlow } from "@/lib/api";

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
  const [mounted, setMounted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "loading" | "saved" | "error">("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, reset, loadFlow } =
    useFlowStore();

  useEffect(() => { setMounted(true); }, []);

  async function handlePublish() {
    setSyncStatus("saving");
    const result = await saveFlow({ name: "Flow Principal", nodes, edges });
    if (result) {
      setSyncStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSyncStatus("idle"), 3000);
    } else {
      setSyncStatus("error");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSyncStatus("idle"), 3000);
    }
  }

  async function handleLoad() {
    setSyncStatus("loading");
    const flow = await getFlow();
    if (flow && flow.nodes?.length) {
      loadFlow(flow.nodes as any, flow.edges as any);
      setSyncStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSyncStatus("idle"), 3000);
    } else {
      setSyncStatus("error");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSyncStatus("idle"), 3000);
    }
  }

  const syncLabel =
    syncStatus === "saving" ? "Publicando…"
    : syncStatus === "loading" ? "Carregando…"
    : syncStatus === "saved" ? "Sincronizado ✓"
    : syncStatus === "error" ? "Erro de sincronização"
    : "";

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {confirmReset && (
        <ConfirmDialog
          title="Apagar todo o fluxo?"
          message="Os nós e conexões atuais serão perdidos e o fluxo voltará ao exemplo padrão."
          confirmLabel="Apagar"
          danger
          onConfirm={() => { setConfirmReset(false); reset(); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {/* Toolbar */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b shadow-sm z-10">
        <Link href="/" className="text-gray-400 hover:text-gray-600 transition">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-sm font-semibold text-gray-700">Editor de Fluxo</h1>
        {syncLabel && (
          <span className={`text-[10px] hidden sm:inline ${syncStatus === "error" ? "text-red-500" : syncStatus === "saved" ? "text-green-600" : "text-gray-400"}`}>
            {syncLabel}
          </span>
        )}
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
          onClick={handleLoad}
          disabled={syncStatus === "loading" || syncStatus === "saving"}
          className="flex items-center gap-1 text-gray-600 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-100 transition disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Carregar
        </button>

        <button
          onClick={handlePublish}
          disabled={syncStatus === "loading" || syncStatus === "saving"}
          className="flex items-center gap-1 text-white text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 font-medium transition disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          Publicar
        </button>

        <button
          onClick={() => setConfirmReset(true)}
          className="flex items-center gap-1 text-gray-500 text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-100 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Resetar
        </button>
      </header>

      {/* Canvas */}
      <div className="flex-1 relative">
        {!mounted ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Carregando editor…
          </div>
        ) : <ReactFlow
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
        </ReactFlow>}

        {mounted && <NodeInspector />}
      </div>
    </div>
  );
}
