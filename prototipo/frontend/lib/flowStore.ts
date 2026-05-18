"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";

export type NodeKind = "message" | "condition" | "action" | "trigger";

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  kind: NodeKind;
  content?: string;
  actionType?: "whatsapp" | "generate_doc" | "update_sheet" | "fallback";
  conditionField?: string;
  conditionValue?: string;
}

const DEFAULT_NODES: Node<FlowNodeData>[] = [
  {
    id: "trigger-1",
    type: "triggerNode",
    position: { x: 80, y: 160 },
    data: { label: "Nova Reserva", kind: "trigger", content: "E-mail recebido do Booking/Airbnb" },
  },
  {
    id: "msg-1",
    type: "messageNode",
    position: { x: 320, y: 80 },
    data: {
      label: "Boas-vindas",
      kind: "message",
      content:
        "Olá, {guest_name}! Bem-vindo ao {hotel_name}.\nCheck-in: {checkin} às {checkin_time}h\nCheck-out: {checkout} até {checkout_time}h",
    },
  },
  {
    id: "cond-1",
    type: "conditionNode",
    position: { x: 320, y: 260 },
    data: { label: "É cancelamento?", kind: "condition", conditionField: "is_cancellation", conditionValue: "true" },
  },
  {
    id: "action-1",
    type: "actionNode",
    position: { x: 560, y: 100 },
    data: { label: "Enviar WhatsApp", kind: "action", actionType: "whatsapp" },
  },
  {
    id: "action-2",
    type: "actionNode",
    position: { x: 560, y: 220 },
    data: { label: "Gerar Ficha", kind: "action", actionType: "generate_doc" },
  },
  {
    id: "action-3",
    type: "actionNode",
    position: { x: 560, y: 340 },
    data: { label: "Atualizar Planilha", kind: "action", actionType: "update_sheet" },
  },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e1", source: "trigger-1", target: "msg-1",    type: "deletable" },
  { id: "e2", source: "trigger-1", target: "cond-1",   type: "deletable" },
  { id: "e3", source: "msg-1",     target: "action-1", type: "deletable" },
  { id: "e4", source: "cond-1",    target: "action-2", type: "deletable", label: "Não" },
  { id: "e5", source: "cond-1",    target: "action-3", type: "deletable", label: "Não" },
];

interface FlowStore {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  selectedId: string | null;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  updateNodeData: (id: string, data: Partial<FlowNodeData>) => void;
  addNode: (kind: NodeKind) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  setSelected: (id: string | null) => void;
  reset: () => void;
}

export const useFlowStore = create<FlowStore>()(
  persist(
    (set, get) => ({
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
      selectedId: null,

      onNodesChange: (changes) =>
        set({ nodes: applyNodeChanges(changes, get().nodes) as Node<FlowNodeData>[] }),

      onEdgesChange: (changes) =>
        set({ edges: applyEdgeChanges(changes, get().edges) }),

      onConnect: (conn) =>
        set({ edges: addEdge({ ...conn, id: `e-${Date.now()}`, type: "deletable" }, get().edges) }),

      updateNodeData: (id, data) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...data } } : n
          ),
        }),

      addNode: (kind) => {
        const typeMap: Record<NodeKind, string> = {
          message: "messageNode",
          condition: "conditionNode",
          action: "actionNode",
          trigger: "triggerNode",
        };
        const newNode: Node<FlowNodeData> = {
          id: `${kind}-${Date.now()}`,
          type: typeMap[kind],
          position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
          data: { label: "Novo nó", kind },
        };
        set({ nodes: [...get().nodes, newNode] });
      },

      deleteNode: (id) => {
        const { nodes, edges } = get();
        const edgeChanges: EdgeChange[] = edges
          .filter((e) => e.source === id || e.target === id)
          .map((e) => ({ type: "remove" as const, id: e.id }));
        set({
          nodes: applyNodeChanges([{ type: "remove", id }], nodes) as Node<FlowNodeData>[],
          edges: edgeChanges.length ? applyEdgeChanges(edgeChanges, edges) : edges,
          selectedId: null,
        });
      },

      deleteEdge: (id) =>
        set({ edges: applyEdgeChanges([{ type: "remove", id }], get().edges) }),

      setSelected: (id) => set({ selectedId: id }),

      reset: () => set({ nodes: DEFAULT_NODES, edges: DEFAULT_EDGES }),
    }),
    { name: "hostmaster-flow" }
  )
);
