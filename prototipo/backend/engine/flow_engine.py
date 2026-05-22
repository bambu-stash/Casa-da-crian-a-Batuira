"""
FlowEngine — interpreta nós e arestas do flow visual para controlar o bot.

Usado pelo webhook para buscar conteúdo de mensagens e avaliar condições
diretamente do flow salvo no banco, substituindo templates hardcoded.
"""
from __future__ import annotations

import json
from typing import Any


class FlowEngine:
    def __init__(self, nodes: list[dict], edges: list[dict]) -> None:
        self._nodes: dict[str, dict] = {n["id"]: n for n in nodes}
        self._edges: list[dict] = edges

    # ── Acesso a nós ──────────────────────────────────────────────────────────

    def node(self, node_id: str) -> dict | None:
        return self._nodes.get(node_id)

    def content(self, node_id: str, ctx: dict[str, Any] | None = None) -> str | None:
        """Retorna o conteúdo renderizado de um nó de mensagem, ou None se não encontrado."""
        n = self._nodes.get(node_id)
        if not n:
            return None
        raw: str = n.get("data", {}).get("content") or ""
        if not raw:
            return None
        return self._render(raw, ctx or {})

    def condition(self, node_id: str, ctx: dict[str, Any]) -> bool:
        """Avalia um nó de condição contra o contexto atual."""
        n = self._nodes.get(node_id)
        if not n:
            return True
        data = n.get("data", {})
        field = data.get("conditionField", "")
        expected = str(data.get("conditionValue", "")).lower()
        actual = str(ctx.get(field, "")).lower()
        return actual == expected

    def next_node(self, from_id: str, condition_result: bool | None = None) -> str | None:
        """Retorna o ID do próximo nó seguindo as arestas.

        Para nós de condição, use condition_result=True/False para seguir
        a aresta "Sim" ou "Não". Para outros nós, condition_result=None
        segue a única aresta de saída.
        """
        outgoing = [e for e in self._edges if e["source"] == from_id]
        if not outgoing:
            return None
        if condition_result is None:
            return outgoing[0]["target"]
        label = "Sim" if condition_result else "Não"
        for e in outgoing:
            if e.get("label") == label:
                return e["target"]
        return None

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _render(self, template: str, ctx: dict[str, Any]) -> str:
        result = template
        for key, value in ctx.items():
            result = result.replace(f"{{{key}}}", str(value) if value is not None else "")
        return result

    # ── Factory ───────────────────────────────────────────────────────────────

    @classmethod
    def from_row(cls, row: dict) -> "FlowEngine":
        """Cria um FlowEngine a partir de uma linha da tabela flows."""
        nodes = json.loads(row["nodes"]) if isinstance(row["nodes"], str) else row["nodes"]
        edges = json.loads(row["edges"]) if isinstance(row["edges"], str) else row["edges"]
        return cls(nodes, edges)
