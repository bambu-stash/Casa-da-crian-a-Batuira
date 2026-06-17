"""Gerenciador de sessões em memória para o FlowEngine."""
from dataclasses import dataclass, field


@dataclass
class Session:
    user_id: str
    current_node_id: str
    waiting_for_input: bool = False
    variables: dict = field(default_factory=dict)


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    def create(self, user_id: str, node_id: str) -> Session:
        s = Session(user_id=user_id, current_node_id=node_id)
        self._sessions[user_id] = s
        return s

    def get(self, user_id: str) -> Session | None:
        return self._sessions.get(user_id)

    def update(self, user_id: str, **kwargs) -> Session | None:
        s = self._sessions.get(user_id)
        if not s:
            return None
        for k, v in kwargs.items():
            setattr(s, k, v)
        return s

    def destroy(self, user_id: str) -> None:
        self._sessions.pop(user_id, None)


session_manager = SessionManager()
