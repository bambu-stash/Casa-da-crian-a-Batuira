"use client";
import { useState } from "react";
import { useFlowStore, type FlowNodeData } from "@/lib/flowStore";
import { X, Trash2 } from "lucide-react";

const ACTION_OPTIONS = [
  { value: "whatsapp",     label: "Enviar WhatsApp" },
  { value: "generate_doc", label: "Gerar Ficha .docx" },
  { value: "update_sheet", label: "Atualizar Planilha" },
  { value: "fallback",     label: "Fallback Humano" },
];

export default function NodeInspector() {
  const { nodes, updateNodeData, deleteNode, onNodesChange } = useFlowStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Drive inspector from ReactFlow's own selection state
  const node = nodes.find((n) => n.selected);

  if (!node) return null;

  const d = node.data as FlowNodeData;
  const isTrigger = d.kind === "trigger";
  const update = (patch: Partial<FlowNodeData>) => updateNodeData(node.id, patch);

  const handleClose = () => {
    onNodesChange([{ type: "select", id: node.id, selected: false }]);
    setConfirmDelete(false);
  };

  const handleDelete = () => {
    deleteNode(node.id);
    setConfirmDelete(false);
  };

  return (
    <aside className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-lg z-10 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm text-gray-700">Editar nó</h3>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Label */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nome do nó</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={d.label}
            onChange={(e) => update({ label: e.target.value })}
          />
        </div>

        {/* Message / Trigger content */}
        {(d.kind === "message" || d.kind === "trigger") && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Conteúdo da mensagem</label>
            <p className="text-xs text-gray-400 mb-1">
              Variáveis:{" "}
              {["{contact_name}", "{sector_name}", "{institution_name}", "{position}"].map((v) => (
                <code key={v} className="bg-gray-100 px-1 rounded mr-1">{v}</code>
              ))}
            </p>
            <textarea
              rows={6}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none font-mono"
              value={d.content ?? ""}
              onChange={(e) => update({ content: e.target.value })}
            />
          </div>
        )}

        {/* Condition fields */}
        {d.kind === "condition" && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Campo</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 font-mono"
                value={d.conditionField ?? ""}
                placeholder="ex: is_cancellation"
                onChange={(e) => update({ conditionField: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Valor esperado</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 font-mono"
                value={d.conditionValue ?? ""}
                placeholder="ex: true"
                onChange={(e) => update({ conditionValue: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-400 bg-amber-50 px-2 py-1.5 rounded-lg">
              Arraste o handle <strong className="text-green-600">verde</strong> para "Sim" e o{" "}
              <strong className="text-red-500">vermelho</strong> para "Não".
            </p>
          </>
        )}

        {/* Action type */}
        {d.kind === "action" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo de ação</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              value={d.actionType ?? ""}
              onChange={(e) => update({ actionType: e.target.value as FlowNodeData["actionType"] })}
            >
              <option value="">Selecione...</option>
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Delete footer */}
      <div className="border-t px-4 py-3">
        {!confirmDelete ? (
          <button
            onClick={() => !isTrigger && setConfirmDelete(true)}
            disabled={isTrigger}
            title={isTrigger ? "O nó de gatilho não pode ser removido" : "Excluir este nó"}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Trash2 className="w-4 h-4" />
            Excluir nó
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-center text-red-600 font-medium">Excluir permanentemente?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-lg transition"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

    </aside>
  );
}
