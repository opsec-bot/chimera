import { __test } from '../src/services/stubBuilder/inject';

const { KEY_MAGIC, BLOB_LEN, NONCE_LEN, LEN_FIELD, patchKeyBlob } = __test;

const prefix = Buffer.from('hello world fake .text section content');
const blob = Buffer.alloc(BLOB_LEN);
KEY_MAGIC.copy(blob, 0);
const suffix = Buffer.from('trailing data');
const fake = Buffer.concat([prefix, blob, suffix]);

const key = 'sk_test_abcdef0123456789_THE_REAL_KEY';
const patched = patchKeyBlob(Buffer.from(fake), key);

const idx = patched.indexOf(KEY_MAGIC);
const len = patched.readUInt16BE(idx + KEY_MAGIC.length);
const nonceStart = idx + KEY_MAGIC.length + LEN_FIELD;
const ctStart = nonceStart + NONCE_LEN;
const nonce = patched.subarray(nonceStart, ctStart);
const ct = patched.subarray(ctStart, ctStart + len);
const out = Buffer.alloc(len);
for (let i = 0; i < len; i++) out[i] = ct[i] ^ nonce[i % NONCE_LEN];
const decoded = out.toString('utf8');

console.log('round-trip:', decoded === key ? 'OK' : `FAIL (${decoded})`);
console.log('blob len const:', BLOB_LEN);
console.log('patched size unchanged:', patched.length === fake.length);
console.log('key len:', key.length, '/ 256');

// Re-patch the same buffer with a different key, verify decode again
const key2 = 'a'.repeat(64);
const patched2 = patchKeyBlob(Buffer.from(fake), key2);
const idx2 = patched2.indexOf(KEY_MAGIC);
const len2 = patched2.readUInt16BE(idx2 + KEY_MAGIC.length);
const nonce2 = patched2.subarray(idx2 + KEY_MAGIC.length + LEN_FIELD, idx2 + KEY_MAGIC.length + LEN_FIELD + NONCE_LEN);
const ct2 = patched2.subarray(idx2 + KEY_MAGIC.length + LEN_FIELD + NONCE_LEN, idx2 + KEY_MAGIC.length + LEN_FIELD + NONCE_LEN + len2);
const out2 = Buffer.alloc(len2);
for (let i = 0; i < len2; i++) out2[i] = ct2[i] ^ nonce2[i % NONCE_LEN];
console.log('round-trip 2:', out2.toString('utf8') === key2 ? 'OK' : 'FAIL');

// Error cases
try { patchKeyBlob(Buffer.from(prefix), key); console.log('missing-magic: FAIL (no throw)'); }
catch (e) { console.log('missing-magic:', (e as Error).message.includes('sentinel not found') ? 'OK' : 'FAIL'); }

try { patchKeyBlob(Buffer.from(fake), 'x'.repeat(300)); console.log('too-long: FAIL (no throw)'); }
catch (e) { console.log('too-long:', (e as Error).message.includes('out of range') ? 'OK' : 'FAIL'); }
