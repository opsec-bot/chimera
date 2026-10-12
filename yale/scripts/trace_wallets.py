"""
Pull full transaction history for a set of Solana wallets via Helius's
enhanced transactions API, and summarize outbound transfers so downstream
movement (e.g. toward exchange deposit addresses) can be reviewed.

Usage: python trace_wallets.py <api_key_file> <out_dir>
"""
import sys
import json
import time
import urllib.request
import urllib.error

WALLETS = {
    "77bKf6Y49TzKacj5fWg3j8ajfLSefLBsbZM92fdjGbLu": "flagged-destination-1 (26% split recipient)",
    "AdmQNzoYAR9ReWHszonfhUPfTSZQ5caXKPkkcW562AkH": "flagged-destination-2 (74% split recipient)",
    "G1haWfjDGYPExQvCT2bbYpQ83cmrN18SV8C78VHn6uio": "suspected relayer/gas-sponsor wallet",
}

# NOTE: intentionally no hardcoded "known CEX address" table here. Guessing
# exchange hot-wallet addresses from memory risks presenting unverified,
# possibly-wrong labels as fact in a security investigation. Instead this
# script aggregates outbound destinations by volume so the top recipients
# can be checked against an authoritative source (Solscan/Arkham entity
# labels) by hand.

RPC_URL_TMPL = "https://api.helius.xyz/v0/addresses/{addr}/transactions?api-key={key}&limit=100"


def http_get_json(url, retries=5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "drain-investigation/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code == 429:
                wait = 2 ** attempt
                print(f"    rate limited, sleeping {wait}s...")
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {e.code}: {body}") from e
    raise RuntimeError("exceeded retries")


def fetch_all_helius(addr, key, max_pages=20):
    out = []
    before = None
    for page in range(max_pages):
        url = RPC_URL_TMPL.format(addr=addr, key=key)
        if before:
            url += f"&before={before}"
        batch = http_get_json(url)
        if not batch:
            break
        out.extend(batch)
        if len(batch) < 100:
            break
        before = batch[-1]["signature"]
        time.sleep(0.15)
    return out


def summarize(addr, label, txs, out_dir):
    fname = f"{out_dir}/wallet_{addr}.json"
    with open(fname, "w") as f:
        json.dump(txs, f, indent=2)

    print(f"\n=== {addr}  ({label}) ===")
    print(f"  Total transactions fetched: {len(txs)}")
    if txs:
        oldest = txs[-1].get("timestamp")
        newest = txs[0].get("timestamp")
        print(f"  Time range (unix): {oldest} .. {newest}")

    outbound_native = []
    outbound_token = []
    dest_totals = {}  # dest_addr -> {"sol": float, "tokens": {mint: amount}, "tx_count": int, "sigs": [...]}

    for tx in txs:
        for nt in tx.get("nativeTransfers", []) or []:
            if nt.get("fromUserAccount") == addr and nt.get("amount", 0) > 0:
                amt = nt["amount"] / 1e9
                to = nt["toUserAccount"]
                outbound_native.append((tx["signature"], to, amt, tx.get("timestamp")))
                d = dest_totals.setdefault(to, {"sol": 0.0, "tokens": {}, "tx_count": 0, "sigs": []})
                d["sol"] += amt
                d["tx_count"] += 1
                d["sigs"].append(tx["signature"])
        for tt in tx.get("tokenTransfers", []) or []:
            if tt.get("fromUserAccount") == addr and tt.get("tokenAmount", 0) > 0:
                to = tt["toUserAccount"]
                mint = tt.get("mint")
                amt = tt["tokenAmount"]
                outbound_token.append((tx["signature"], to, mint, amt, tx.get("timestamp")))
                d = dest_totals.setdefault(to, {"sol": 0.0, "tokens": {}, "tx_count": 0, "sigs": []})
                d["tokens"][mint] = d["tokens"].get(mint, 0) + amt
                d["tx_count"] += 1
                d["sigs"].append(tx["signature"])

    print(f"  Outbound native SOL transfers: {len(outbound_native)}")
    for sig, to, amt, ts in outbound_native[:25]:
        print(f"    {ts}  {amt:.6f} SOL -> {to}   sig={sig}")

    print(f"  Outbound SPL token transfers: {len(outbound_token)}")
    for sig, to, mint, amt, ts in outbound_token[:25]:
        print(f"    {ts}  {amt} of mint {mint} -> {to}   sig={sig}")

    print(f"  Distinct outbound destination addresses: {len(dest_totals)}")
    ranked = sorted(dest_totals.items(), key=lambda kv: (kv[1]["sol"], sum(kv[1]["tokens"].values())), reverse=True)
    print("  Top destinations by SOL volume (verify entity identity yourself via Solscan/Arkham -- not auto-labeled):")
    for to, d in ranked[:15]:
        token_summary = ", ".join(f"{amt} of {mint}" for mint, amt in d["tokens"].items())
        print(f"    {to}  |  {d['sol']:.6f} SOL total  |  tokens: {token_summary or '-'}  |  {d['tx_count']} txs  |  https://solscan.io/account/{to}")

    return {
        "address": addr,
        "label": label,
        "tx_count": len(txs),
        "outbound_native_count": len(outbound_native),
        "outbound_token_count": len(outbound_token),
        "distinct_destinations": len(dest_totals),
        "top_destinations": [{"address": to, **d} for to, d in ranked[:15]],
    }


def main():
    key_file = sys.argv[1] if len(sys.argv) > 1 else "scripts/.helius_key"
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "out"

    with open(key_file) as f:
        api_key = f.read().strip()

    results = []
    for addr, label in WALLETS.items():
        print(f"Fetching transactions for {addr} ({label})...")
        txs = fetch_all_helius(addr, api_key)
        results.append(summarize(addr, label, txs, out_dir))

    print("\n\n=== SUMMARY ===")
    for r in results:
        print(f"  {r['address']} ({r['label']}): {r['tx_count']} txs, "
              f"{r['outbound_native_count']} SOL out, {r['outbound_token_count']} token out, "
              f"{r['distinct_destinations']} distinct destinations")

    summary_path = f"{out_dir}/trace_summary.json"
    with open(summary_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nMachine-readable summary written to {summary_path}")


if __name__ == "__main__":
    main()
