# tests/test_provisioner.py — Fly provisioner name + machine config (no network)
from core.fly_provisioner import FlyProvisioner


def make():
    return FlyProvisioner(
        api_token="t", org_slug="org", region="iad", app_base="chimera-c2"
    )


def test_app_name_short_suffix():
    # under the 30-char Fly limit → passes through untouched
    assert make()._app_name("20261012-c2-api") == "chimera-c2-20261012-c2-api"


def test_app_name_truncates_to_30():
    name = make()._app_name("20261012-123456789-very-long-payload-id-here")
    assert len(name) <= 30
    assert name.startswith("chimera-c2-")
    assert not name.endswith("-")


def test_machine_config_port_param():
    """The drainer backend listens on 3000, not the default 8443."""
    cfg = make()._machine_config(
        image="registry.fly.io/chimera-drainer:latest",
        vm_env={"A": "1"},
        memory_mb=512,
        machine_type="shared-cpu-1x",
        vm_port=3000,
    )
    svc = cfg["config"]["services"][0]
    assert svc["internal_port"] == 3000
    assert svc["ports"][0]["port"] == 3000
    assert cfg["config"]["env"]["A"] == "1"
    assert "size" not in cfg["config"]  # default type → no size preset


def test_machine_config_size_preset():
    cfg = make()._machine_config(
        image="img",
        vm_env={},
        memory_mb=1024,
        machine_type="shared-cpu-2x",
        vm_port=8443,
    )
    assert cfg["config"]["size"] == "shared-cpu-2x"
    assert cfg["config"]["guest"]["memory_mb"] == 1024
    assert cfg["region"] == "iad"
