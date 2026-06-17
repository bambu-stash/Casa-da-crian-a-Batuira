"""Testes — /api/contacts e /api/quick-replies."""
import pytest


# ── Contacts ──────────────────────────────────────────────────────────────────

class TestGetContact:
    def test_contato_inexistente_retorna_defaults(self, auth_client):
        resp = auth_client.get("/api/contacts/5511999990000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["phone"] == "5511999990000"
        assert data["name_override"] == ""
        assert data["notes"] == ""

    def test_contato_existente_retorna_dados(self, auth_client):
        # Cria primeiro
        auth_client.patch(
            "/api/contacts/5511999990001",
            json={"name_override": "Maria", "notes": "VIP"},
        )
        resp = auth_client.get("/api/contacts/5511999990001")
        assert resp.status_code == 200
        assert resp.json()["name_override"] == "Maria"
        assert resp.json()["notes"] == "VIP"

    def test_requer_autenticacao(self, client):
        resp = client.get("/api/contacts/5511999990000")
        assert resp.status_code == 401


class TestPatchContact:
    def test_cria_contato_com_apelido(self, auth_client):
        resp = auth_client.patch(
            "/api/contacts/5511111110000",
            json={"name_override": "João"},
        )
        assert resp.status_code == 200
        assert resp.json()["name_override"] == "João"

    def test_atualiza_apelido_existente(self, auth_client):
        auth_client.patch("/api/contacts/5511111110001", json={"name_override": "Antigo"})
        resp = auth_client.patch("/api/contacts/5511111110001", json={"name_override": "Novo"})
        assert resp.status_code == 200
        assert resp.json()["name_override"] == "Novo"

    def test_atualiza_apenas_notas(self, auth_client):
        auth_client.patch(
            "/api/contacts/5511111110002",
            json={"name_override": "Pedro", "notes": ""},
        )
        resp = auth_client.patch("/api/contacts/5511111110002", json={"notes": "Obs aqui"})
        assert resp.status_code == 200
        assert resp.json()["notes"] == "Obs aqui"
        assert resp.json()["name_override"] == "Pedro"

    def test_patch_vazio_retorna_dados_atuais(self, auth_client):
        auth_client.patch("/api/contacts/5511111110003", json={"name_override": "Ana"})
        resp = auth_client.patch("/api/contacts/5511111110003", json={})
        assert resp.status_code == 200
        assert resp.json()["name_override"] == "Ana"

    def test_requer_autenticacao(self, client):
        resp = client.patch("/api/contacts/5511111110000", json={"name_override": "X"})
        assert resp.status_code == 401


class TestContactHistory:
    def test_sem_historico_retorna_lista_vazia(self, auth_client):
        resp = auth_client.get("/api/contacts/5511000000000/history")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_requer_autenticacao(self, client):
        resp = client.get("/api/contacts/5511000000000/history")
        assert resp.status_code == 401


# ── Quick Replies ─────────────────────────────────────────────────────────────

class TestListQuickReplies:
    def test_lista_vazia_por_padrao(self, auth_client):
        resp = auth_client.get("/api/quick-replies")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_lista_somente_ativos(self, auth_client):
        auth_client.post(
            "/api/quick-replies",
            json={"title": "Ativa", "content": "Olá!", "shortcut": "/ola", "active": True},
        )
        auth_client.post(
            "/api/quick-replies",
            json={"title": "Inativa", "content": "Bye!", "shortcut": "/bye", "active": False},
        )
        resp = auth_client.get("/api/quick-replies")
        titles = [r["title"] for r in resp.json()]
        assert "Ativa" in titles
        assert "Inativa" not in titles

    def test_requer_autenticacao(self, client):
        resp = client.get("/api/quick-replies")
        assert resp.status_code == 401


class TestCreateQuickReply:
    def test_cria_resposta_rapida(self, auth_client):
        resp = auth_client.post(
            "/api/quick-replies",
            json={"title": "Saudação", "content": "Olá! Como posso ajudar?", "shortcut": "/oi"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Saudação"
        assert data["content"] == "Olá! Como posso ajudar?"
        assert data["shortcut"] == "/oi"
        assert data["active"] == 1
        assert "id" in data

    def test_shortcut_opcional(self, auth_client):
        resp = auth_client.post(
            "/api/quick-replies",
            json={"title": "Sem atalho", "content": "Texto sem atalho"},
        )
        assert resp.status_code == 201
        assert resp.json()["shortcut"] == ""

    def test_requer_autenticacao(self, client):
        resp = client.post(
            "/api/quick-replies",
            json={"title": "X", "content": "Y"},
        )
        assert resp.status_code == 401


class TestUpdateQuickReply:
    def test_atualiza_resposta_rapida(self, auth_client):
        cr = auth_client.post(
            "/api/quick-replies",
            json={"title": "Original", "content": "Texto original"},
        ).json()
        qr_id = cr["id"]

        resp = auth_client.put(
            f"/api/quick-replies/{qr_id}",
            json={"title": "Atualizado", "content": "Novo texto", "shortcut": "/novo"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Atualizado"
        assert resp.json()["content"] == "Novo texto"

    def test_404_para_id_inexistente(self, auth_client):
        resp = auth_client.put(
            "/api/quick-replies/9999",
            json={"title": "X", "content": "Y"},
        )
        assert resp.status_code == 404

    def test_requer_autenticacao(self, client):
        resp = client.put("/api/quick-replies/1", json={"title": "X", "content": "Y"})
        assert resp.status_code == 401


class TestDeleteQuickReply:
    def test_deleta_resposta_rapida(self, auth_client):
        cr = auth_client.post(
            "/api/quick-replies",
            json={"title": "Deletar", "content": "Vai sumir"},
        ).json()
        qr_id = cr["id"]

        resp = auth_client.delete(f"/api/quick-replies/{qr_id}")
        assert resp.status_code == 204

        # Confirma que sumiu
        lista = auth_client.get("/api/quick-replies").json()
        ids = [r["id"] for r in lista]
        assert qr_id not in ids

    def test_delete_id_inexistente_nao_falha(self, auth_client):
        resp = auth_client.delete("/api/quick-replies/9999")
        assert resp.status_code == 204

    def test_requer_autenticacao(self, client):
        resp = client.delete("/api/quick-replies/1")
        assert resp.status_code == 401
