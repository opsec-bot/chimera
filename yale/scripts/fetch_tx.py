"""Fetch a transaction, decode top-level + inner instructions, and compute
Anchor 8-byte global instruction discriminators for known instruction names
so we can match them against raw instruction data.
"""
import sys
import json
import hashlib
import urllib.request

RPC_URL = "https://api.mainnet-beta.solana.com"


def rpc(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(RPC_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def anchor_discriminator(ix_name: str) -> str:
    preimage = f"global:{ix_name}".encode()
    return hashlib.sha256(preimage).digest()[:8].hex()


def main():
    txid = sys.argv[1] if len(sys.argv) > 1 else "3bEYY6fUyfLVj73MeRRW8n4uHvx1z8wVexEz3tQ7UsLQLqNkNuR7hrSXYfcPrG8CKsNdx91SecTVaMJz3na1Cf5h"

    print("=== Anchor instruction discriminators (sha256('global:<name>')[:8]) ===")
    for name in ["TransferSol", "TransferToken", "TransferToken2022"]:
        print(f"  {name:20s} -> {anchor_discriminator(name)}")
    print()

    res = rpc("getTransaction", [txid, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}])
    result = res.get("result")
    if result is None:
        print("Transaction not found / not returned by public RPC (may be too old / pruned). Error:", res.get("error"))
        return

    out_path = "out/tx_raw.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Full parsed transaction saved to {out_path}")

    meta = result.get("meta", {})
    msg = result["transaction"]["message"]
    account_keys = msg["accountKeys"]

    print()
    print("=== Account keys ===")
    for i, ak in enumerate(account_keys):
        pk = ak["pubkey"] if isinstance(ak, dict) else ak
        signer = ak.get("signer") if isinstance(ak, dict) else None
        writable = ak.get("writable") if isinstance(ak, dict) else None
        print(f"  [{i}] {pk}  signer={signer} writable={writable}")

    print()
    print("=== Top-level instructions ===")
    for i, ix in enumerate(msg["instructions"]):
        prog = ix.get("programId")
        if "parsed" in ix:
            print(f"  [{i}] program={prog}  parsed={json.dumps(ix['parsed'])[:300]}")
        else:
            print(f"  [{i}] program={prog}  data(base58)={ix.get('data')}  accounts={ix.get('accounts')}")

    print()
    print("=== Inner instructions ===")
    for grp in meta.get("innerInstructions", []):
        print(f"  -- inner set for top-level index {grp['index']} --")
        for ix in grp["instructions"]:
            prog = ix.get("programId")
            if "parsed" in ix:
                print(f"     program={prog}  parsed={json.dumps(ix['parsed'])[:300]}")
            else:
                print(f"     program={prog}  data(base58)={ix.get('data')}  accounts={ix.get('accounts')}")

    print()
    print("=== Log messages ===")
    for line in meta.get("logMessages", []):
        print(" ", line)

    print()
    print("=== Balance changes (pre/post) ===")
    pre_sol = meta.get("preBalances", [])
    post_sol = meta.get("postBalances", [])
    for i, ak in enumerate(account_keys):
        pk = ak["pubkey"] if isinstance(ak, dict) else ak
        if i < len(pre_sol) and pre_sol[i] != post_sol[i]:
            print(f"  SOL  {pk}: {pre_sol[i]} -> {post_sol[i]}  (delta {post_sol[i]-pre_sol[i]})")

    pre_tok = {t["accountIndex"]: t for t in meta.get("preTokenBalances", [])}
    post_tok = {t["accountIndex"]: t for t in meta.get("postTokenBalances", [])}
    for idx in set(pre_tok) | set(post_tok):
        pre = pre_tok.get(idx)
        post = post_tok.get(idx)
        pre_amt = pre["uiTokenAmount"]["uiAmountString"] if pre else "0"
        post_amt = post["uiTokenAmount"]["uiAmountString"] if post else "0"
        owner = (post or pre).get("owner")
        mint = (post or pre).get("mint")
        if pre_amt != post_amt:
            print(f"  TOKEN idx={idx} owner={owner} mint={mint}: {pre_amt} -> {post_amt}")


if __name__ == "__main__":
    main()
