# tests/test_service_api.py — HTTP API for the bot (mocked DrainerService)
import pytest

from core import service_api


class _FakeRegistry:
    def all(self):
        return []


class FakeService:
    def __init__(self):
        self.customers = []
        self.registry = _FakeRegistry()
        self.backend_origin = lambda: "https://chimera-drainer.fly.dev"

    def create_customer(self, wallet, chat_id):
        # mirror the real service contract: ValueError on bad wallet
        from core.customer_sites import is_valid_wallet

        if not is_valid_wallet(wallet):
            raise ValueError(f"invalid Solana wallet: {wallet}")
        self.customers.append(wallet)
        return {"wallet": wallet, "url": f"https://claim-x.vercel.app", "project_name": "claim-x"}


@pytest.fixture()
def client(monkeypatch):
    fake = FakeService()
    monkeypatch.setattr(service_api, "service", fake)
    monkeypatch.setattr(service_api, "service_key", "k1")
    service_api.app.config["TESTING"] = True
    return service_api.app.test_client(), fake


def auth_headers():
    return {"X-Service-Key": "k1"}


def test_health_open(client):
    c, _ = client
    r = c.get("/health")
    assert r.status_code == 200
    assert r.get_json()["ok"] is True


def test_requires_service_key(client):
    c, _ = client
    r = c.get("/customers")
    assert r.status_code == 401


def test_create_customer(client):
    c, fake = client
    r = c.post(
        "/customers",
        headers=auth_headers(),
        json={"wallet": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "chat_id": "-100"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["url"].startswith("https://")
    assert len(fake.customers) == 1


def test_create_customer_bad_wallet(client):
    c, fake = client
    r = c.post(
        "/customers",
        headers=auth_headers(),
        json={"wallet": "garbage", "chat_id": "-100"},
    )
    assert r.status_code == 400
    assert "invalid" in r.get_json()["error"]
    assert len(fake.customers) == 0


def test_create_customer_missing_chat_id(client):
    c, _ = client
    r = c.post("/customers", headers=auth_headers(), json={"wallet": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"})
    assert r.status_code == 400


def test_create_customer_internal_error(client, monkeypatch):
    c, _ = client

    def boom(wallet, chat_id):
        raise RuntimeError("vercel down")

    monkeypatch.setattr(service_api.service, "create_customer", boom)
    r = c.post(
        "/customers",
        headers=auth_headers(),
        json={"wallet": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "chat_id": "-100"},
    )
    # deployment failure → 500 with a generic message (no internals leaked)
    assert r.status_code == 500
    assert r.get_json()["error"] == "deployment failed"
