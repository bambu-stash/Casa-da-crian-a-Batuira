"""Motor de execução de fluxos visuais (nodes + edges do React Flow)."""
from dataclasses import dataclass, field


@dataclass
class FlowResult:
    messages: list = field(default_factory=list)
    waiting: bool = False
    next_node_id: str | None = None
    variables: dict = field(default_factory=dict)
    terminal_action: str | None = None  # "end" | "sector"
    institution: str | None = None
    sector_name: str | None = None


class FlowEngine:
    def __init__(self, nodes: list, edges: list):
        self._nodes = {n["id"]: n for n in nodes}
        self._edges = edges

    def get_start_node_id(self) -> str | None:
        for node_id, node in self._nodes.items():
            if node["data"]["kind"] == "trigger":
                return node_id
        return None

    def _next_targets(self, node_id: str, label: str | None = None) -> list[str]:
        return [
            e["target"]
            for e in self._edges
            if e["source"] == node_id
            and (label is None or e.get("label") == label)
        ]

    def _show_menu(self, node_id: str, result: FlowResult) -> None:
        data = self._nodes[node_id]["data"]
        content = data.get("content", "")
        options = data.get("menuOptions", [])
        opts_str = "\n".join(
            f"{i + 1}. {opt['label']}" for i, opt in enumerate(options)
        )
        result.messages.append(f"{content}\n{opts_str}" if content else opts_str)
        result.waiting = True
        result.next_node_id = node_id

    def process_message(
        self,
        current_node_id: str,
        text: str,
        variables: dict,
        is_reply: bool,
    ) -> FlowResult:
        result = FlowResult(variables=dict(variables))
        node = self._nodes.get(current_node_id)
        if not node:
            return result

        if is_reply:
            kind = node["data"]["kind"]
            if kind == "question":
                var_name = node["data"].get("variable", "")
                if var_name:
                    result.variables[var_name] = text
                targets = self._next_targets(current_node_id)
                if targets:
                    return self._run(targets[0], result)
            elif kind == "menu":
                choices = {
                    e.get("label", ""): e["target"]
                    for e in self._edges
                    if e["source"] == current_node_id
                }
                target = choices.get(text)
                if target:
                    return self._run(target, result)
                # Opção inválida — reexibe menu
                self._show_menu(current_node_id, result)
            return result

        return self._run(current_node_id, result)

    def _run(self, node_id: str, result: FlowResult) -> FlowResult:
        node = self._nodes.get(node_id)
        if not node:
            return result

        kind = node["data"]["kind"]
        data = node["data"]

        if kind == "trigger":
            targets = self._next_targets(node_id)
            if targets:
                return self._run(targets[0], result)

        elif kind == "message":
            content = data.get("content", "")
            for k, v in result.variables.items():
                content = content.replace(f"{{{k}}}", str(v))
            result.messages.append(content)
            targets = self._next_targets(node_id)
            if targets:
                return self._run(targets[0], result)

        elif kind == "question":
            result.messages.append(data.get("content", ""))
            result.waiting = True
            result.next_node_id = node_id

        elif kind == "menu":
            self._show_menu(node_id, result)

        elif kind == "condition":
            field_name = data.get("conditionField", "")
            value = data.get("conditionValue", "")
            actual = result.variables.get(field_name, "")
            label = "Sim" if actual == value else "Não"
            targets = self._next_targets(node_id, label=label)
            if targets:
                return self._run(targets[0], result)

        elif kind == "end":
            content = data.get("content", "")
            if content:
                result.messages.append(content)
            result.terminal_action = "end"

        elif kind == "sector":
            result.terminal_action = "sector"
            result.sector_name = data.get("sectorName", "")
            result.institution = data.get("institution", "")

        return result
