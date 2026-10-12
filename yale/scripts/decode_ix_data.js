// Decode the four drainer-program instruction payloads from the drain tx (base58 -> disc + amount u64le)
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function bs58decode(s) {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(A.indexOf(c));
  let h = n.toString(16);
  if (h.length % 2) h = '0' + h;
  let b = Buffer.from(h, 'hex');
  let z = 0;
  while (s[z] === '1') z++;
  return Buffer.concat([Buffer.alloc(z), b]);
}
const payloads = [
  ['transfer_token_2022 -> AdmQNzoY ATA (pump token)', 'HgoeiSMsML446uPxgoSFzw'],
  ['transfer_token_2022 -> 77bKf6Y ATA (pump token)', 'HgoeiSMsML4Z12steZSVro'],
  ['transfer_token      -> AdmQNzoY ATA (USDC)',      'U3zC9ztcWNAcrXELwqhJwZ'],
  ['transfer_token      -> 77bKf6Y ATA (USDC)',       'U3zC9ztcWNAxmc2JbffrX1'],
];
for (const [label, d] of payloads) {
  const b = bs58decode(d);
  console.log(label);
  console.log('  raw hex :', b.toString('hex'), `(${b.length} bytes)`);
  console.log('  disc    :', b.subarray(0, 8).toString('hex'));
  console.log('  amount  :', b.readBigUInt64LE(8).toString());
}
