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
    position: { x: 60, y: 220 },
    data: { label: "Mensagem Recebida", kind: "trigger", content: "Contato envia mensagem via WhatsApp" },
  },
  {
    id: "cond-1",
    type: "conditionNode",
    position: { x: 280, y: 140 },
    data: { label: "Horário comercial?", kind: "condition", conditionField: "is_business_hours", conditionValue: "true" },
  },
  {
    id: "msg-off",
    type: "messageNode",
    position: { x: 500, y: 280 },
    data: {
      label: "Fora do Horário",
      kind: "message",
      content: "⏰ Estamos fora do horário de atendimento.\nRetornaremos em breve! 😊",
    },
  },
  {
    id: "msg-inst",
    type: "messageNode",
    position: { x: 500, y: 60 },
    data: {
      label: "Menu de Instituição",
      kind: "message",
      content: "Olá, {contact_name}! 👋\n\n1️⃣ Casa da Criança Batuira\n2️⃣ Casa da Mãe Batuira\n\nDigite o número da opção.",
    },
  },
  {
    id: "msg-sec",
    type: "messageNode",
    position: { x: 740, y: 60 },
    data: {
      label: "Menu de Setores",
      kind: "message",
      content: "Você escolheu *{institution_name}*.\n\n1️⃣ Financeiro\n2️⃣ Pedagógico\n3️⃣ Administrativo\n4️⃣ Assistência Social",
    },
  },
  {
    id: "action-1",
    type: "actionNode",
    position: { x: 980, y: 60 },
    data: { label: "Direcionar para Setor", kind: "action", actionType: "whatsapp" },
  },
];

const DEFAULT_EDGES: Edge[] = [
  { id: "e1", source: "trigger-1", target: "cond-1",   type: "deletable" },
  { id: "e2", source: "cond-1",    target: "msg-inst",  type: "deletable", label: "Sim" },
  { id: "e3", source: "cond-1",    target: "msg-off",   type: "deletable", label: "Não" },
  { id: "e4", source: "msg-inst",  target: "msg-sec",   type: "deletable" },
  { id: "e5", source: "msg-sec",   target: "action-1",  type: "deletable" },
];

interface FlowStore {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
  selectedId: string | null;
  lastSavedAt: number;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  updateNodeData: (id: string, data: Partial<FlowNodeData>) => void;
  addNode: (kind: NodeKind) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  setSelected: (id: string | null) => void;
  reset: () => void;
  loadFlow: (nodes: Node<FlowNodeData>[], edges: Edge[]) => void;
}

export const useFlowStore = create<FlowStore>()(
  persist(
    (set, get) => ({
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
      selectedId: null,
      lastSavedAt: Date.now(),

      onNodesChange: (changes) =>
        set({ nodes: applyNodeChanges(changes, get().nodes) as Node<FlowNodeData>[], lastSavedAt: Date.now() }),

      onEdgesChange: (changes) =>
        set({ edges: applyEdgeChanges(changes, get().edges), lastSavedAt: Date.now() }),

      onConnect: (conn) =>
        set({ edges: addEdge({ ...conn, id: `e-${Date.now()}`, type: "deletable" }, get().edges), lastSavedAt: Date.now() }),

      updateNodeData: (id, data) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...data } } : n
          ),
          lastSavedAt: Date.now(),
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

      reset: () => set({ nodes: DEFAULT_NODES, edges: DEFAULT_EDGES, lastSavedAt: Date.now() }),

      loadFlow: (nodes, edges) =>
        set({ nodes, edges, selectedId: null, lastSavedAt: Date.now() }),
    }),
    { name: "batuira-flow" }
  )
);
