"""
Scan a Solana BPF ELF binary for hardcoded 32-byte pubkeys.

1. Direct search for known/flagged addresses (raw 32-byte form) anywhere in the file.
2. Dump 8-byte-aligned 32-byte windows from .rodata and .data.rel.ro as candidate
   embedded pubkeys (base58-encoded) for manual review, since Anchor account
   structs / static tables are typically laid out at 8-byte alignment.
"""
import sys
from elftools.elf.elffile import ELFFile
import base58

KNOWN = {
    "77bKf6Y49TzKacj5fWg3j8ajfLSefLBsbZM92fdjGbLu": "FLAGGED drain destination wallet #1",
    "AdmQNzoYAR9ReWHszonfhUPfTSZQ5caXKPkkcW562AkH": "FLAGGED drain destination wallet #2",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "SPL Token program",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb": "SPL Token-2022 program",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "Associated Token Account program",
    "EUspc3fXb1dZJECT7PUkkSJsGBJFGSyvfG9CshS3rerv": "This drainer program's own ID",
    "SysvarRent111111111111111111111111111111111": "Rent sysvar",
    "ComputeBudget111111111111111111111111111111": "Compute Budget program",
}


def main(path):
    with open(path, "rb") as f:
        data = f.read()

    print("=== Direct byte search for known/flagged pubkeys (raw 32-byte form) ===")
    for addr, label in KNOWN.items():
        try:
            raw = base58.b58decode(addr)
        except Exception:
            continue
        if len(raw) != 32:
            continue
        offsets = []
        start = 0
        while True:
            idx = data.find(raw, start)
            if idx == -1:
                break
            offsets.append(idx)
            start = idx + 1
        if offsets:
            print(f"  [FOUND] {addr}  ({label})  at file offsets: {[hex(o) for o in offsets]}")
        else:
            print(f"  [not present] {addr}  ({label})")

    print()
    print("=== Candidate embedded pubkeys in .rodata / .data.rel.ro (8-byte aligned windows) ===")
    with open(path, "rb") as f:
        elf = ELFFile(f)
        for secname in (".rodata", ".data.rel.ro"):
            sec = elf.get_section_by_name(secname)
            if sec is None:
                continue
            sdata = sec.data()
            addr0 = sec["sh_addr"]
            print(f"--- section {secname}  size={len(sdata)}  base_vaddr={hex(addr0)} ---")
            seen = set()
            for off in range(0, len(sdata) - 32 + 1, 8):
                chunk = sdata[off:off + 32]
                if chunk in seen:
                    continue
                # skip all-zero / all-0xff / low-entropy chunks (padding, not real keys)
                nonzero = sum(1 for b in chunk if b != 0)
                distinct = len(set(chunk))
                if nonzero < 4 or distinct < 6:
                    continue
                seen.add(chunk)
                b58 = base58.b58encode(chunk).decode()
                tag = KNOWN.get(b58, "")
                marker = f"   <-- {tag}" if tag else ""
                print(f"  vaddr={hex(addr0+off):<12} b58={b58}{marker}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "drainer_program.so")
