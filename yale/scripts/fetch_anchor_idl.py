"""
Compute the Anchor IDL account address for a given program and fetch it
from mainnet via RPC, if it exists. Anchor programs that publish their IDL
on-chain (via `anchor idl init`) store it at a deterministic address derived
with create_with_seed(base, "anchor:idl", program_id), where base is the
program's PDA for empty seeds.
"""
import sys
import json
import base64
import gzip
import hashlib
import urllib.request

from solders.pubkey import Pubkey

RPC_URL = "https://api.mainnet-beta.solana.com"


def find_program_address(seeds, program_id: Pubkey):
    bump = 255
    while bump >= 0:
        try:
            candidate = Pubkey.create_program_address(seeds + [bytes([bump])], program_id)
            return candidate, bump
        except Exception:
            bump -= 1
    raise ValueError("no valid PDA found")


def create_with_seed(base: Pubkey, seed: str, owner: Pubkey) -> Pubkey:
    h = hashlib.sha256()
    h.update(bytes(base))
    h.update(seed.encode("utf-8"))
    h.update(bytes(owner))
    return Pubkey(h.digest())


def idl_address(program_id: Pubkey) -> Pubkey:
    base, _bump = find_program_address([], program_id)
    return create_with_seed(base, "anchor:idl", program_id)


def rpc(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main():
    program_id = Pubkey.from_string(sys.argv[1] if len(sys.argv) > 1 else "EUspc3fXb1dZJECT7PUkkSJsGBJFGSyvfG9CshS3rerv")
    idl_addr = idl_address(program_id)
    print(f"Program ID:     {program_id}")
    print(f"IDL account:    {idl_addr}")

    res = rpc("getAccountInfo", [str(idl_addr), {"encoding": "base64"}])
    value = res.get("result", {}).get("value")
    if value is None:
        print("No on-chain IDL account found at that address (program does not publish an on-chain IDL, or uses a non-standard IDL storage scheme).")
        return

    raw = base64.b64decode(value["data"][0])
    print(f"Raw account data length: {len(raw)} bytes; owner={value['owner']}")

    # Anchor IdlAccount layout: 8-byte discriminator, 32-byte authority,
    # 4-byte little-endian data_len, then zlib/gzip-compressed IDL JSON bytes.
    if len(raw) < 44:
        print("Account too small to be a standard Anchor IdlAccount.")
        return

    discriminator = raw[0:8]
    authority = Pubkey(raw[8:40])
    data_len = int.from_bytes(raw[40:44], "little")
    compressed = raw[44:44 + data_len]
    print(f"IDL authority (upload/update authority): {authority}")
    print(f"Compressed IDL byte length: {data_len}")

    try:
        idl_json = gzip.decompress(compressed)
    except OSError:
        import zlib
        idl_json = zlib.decompress(compressed)

    out_path = sys.argv[2] if len(sys.argv) > 2 else "idl.json"
    with open(out_path, "wb") as f:
        f.write(idl_json)
    print(f"Wrote decompressed IDL JSON to {out_path}")


if __name__ == "__main__":
    main()
