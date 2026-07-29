import fs from 'fs/promises';
import { randomBytes } from 'crypto';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';
import { Logger } from '../../utils/logger';

/**
 * Hot-path inject: take the prebuilt base stub.exe, swap in user-specific
 * resources (icon + VERSIONINFO) and patch the KEY_BLOB sentinel. No cargo,
 * no linker. See templates/stub/src/main.rs for the matching KEY_BLOB layout.
 */

// Keep in sync with KEY_BLOB_MAGIC in templates/stub/src/main.rs.
const KEY_MAGIC = Buffer.from([
  0x00, 0x46, 0x4c, 0x50, 0x2d, 0x4b, 0x45, 0x59, 0x42, 0x4c, 0x4f, 0x42, 0x2d, 0x76, 0x31, 0x00,
]);
const LEN_FIELD = 2;
const NONCE_LEN = 16;
const KEY_SLOT_LEN = 256;
const BLOB_LEN = KEY_MAGIC.length + LEN_FIELD + NONCE_LEN + KEY_SLOT_LEN;

export interface InjectMetadata {
  fileDescription?: string;
  productName?: string;
  productVersion?: string; // X.X.X(.X)
  companyName?: string;
  originalFilename?: string;
  internalName?: string;
}

export interface InjectInputs {
  accessKey: string;
  iconBuffer?: Buffer;
  metadata?: InjectMetadata;
}

export async function injectIntoBase(
  basePath: string,
  outPath: string,
  inputs: InjectInputs,
): Promise<void> {
  const raw = await fs.readFile(basePath);
  // resedit consumes/produces ArrayBuffer; pass the underlying slice to avoid
  // a full copy.
  const exe = NtExecutable.from(toArrayBuffer(raw));
  const res = NtExecutableResource.from(exe);

  if (inputs.iconBuffer && inputs.iconBuffer.length > 0) {
    swapIcon(res, inputs.iconBuffer);
  }

  if (inputs.metadata && hasAnyMetadata(inputs.metadata)) {
    swapVersionInfo(res, inputs.metadata);
  }

  res.outputResource(exe);
  let patched = Buffer.from(exe.generate());

  // Patch KEY_BLOB on the post-resedit buffer. `.rdata` containing the static
  // is not touched by resource rewriting, but doing this last means we never
  // re-scan after a resedit re-emit moves bytes around.
  patched = patchKeyBlob(patched, inputs.accessKey);

  await fs.writeFile(outPath, patched);
}

function swapIcon(res: NtExecutableResource, icoBytes: Buffer): void {
  const icon = Data.IconFile.from(toArrayBuffer(icoBytes));
  // group id 1 matches `IDI_ICON1 ICON` in build.rs's resources.rc
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    1033,
    icon.icons.map((i) => i.data),
  );
}

// Maps our InjectMetadata field names to the VERSIONINFO string-table keys.
// Order is just for stable output; resedit doesn't care.
const META_FIELD_MAP: ReadonlyArray<[keyof InjectMetadata, string]> = [
  ['fileDescription', 'FileDescription'],
  ['productName', 'ProductName'],
  ['productVersion', 'ProductVersion'],
  ['companyName', 'CompanyName'],
  ['originalFilename', 'OriginalFilename'],
  ['internalName', 'InternalName'],
];

function swapVersionInfo(res: NtExecutableResource, m: InjectMetadata): void {
  const list = Resource.VersionInfo.fromEntries(res.entries);
  const vi = list[0] ?? Resource.VersionInfo.createEmpty();
  const lang = { lang: 1033, codepage: 1200 } as const;

  // Merge over any existing string table so we don't blow away fields the
  // base binary baked in (e.g. PolymorphicID).
  const existing = list[0] ? vi.getStringValues(lang) : {};
  const merged: Record<string, string> = { ...existing };
  for (const [field, viKey] of META_FIELD_MAP) {
    const value = m[field];
    if (value !== undefined) merged[viKey] = value;
  }
  vi.setStringValues(lang, merged);

  if (m.productVersion) applyFixedVersion(vi, m.productVersion);

  vi.outputToResourceEntries(res.entries);
}

function applyFixedVersion(vi: Resource.VersionInfo, version: string): void {
  const parts = version.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [a = 0, b = 0, c = 0, d = 0] = parts;
  const ms = ((a & 0xffff) << 16) | (b & 0xffff);
  const ls = ((c & 0xffff) << 16) | (d & 0xffff);
  vi.fixedInfo.fileVersionMS = ms;
  vi.fixedInfo.fileVersionLS = ls;
  vi.fixedInfo.productVersionMS = ms;
  vi.fixedInfo.productVersionLS = ls;
}

function patchKeyBlob(buf: Buffer, key: string): Buffer {
  const keyBytes = Buffer.from(key, 'utf8');
  if (keyBytes.length === 0 || keyBytes.length > KEY_SLOT_LEN) {
    throw new Error(`Access key length ${keyBytes.length} out of range (1..${KEY_SLOT_LEN})`);
  }

  const idx = buf.indexOf(KEY_MAGIC);
  if (idx < 0) {
    throw new Error('KEY_BLOB sentinel not found in base binary; rebuild base');
  }
  const second = buf.indexOf(KEY_MAGIC, idx + 1);
  if (second >= 0) {
    throw new Error('Multiple KEY_BLOB sentinels found; refusing to patch');
  }

  const nonce = randomBytes(NONCE_LEN);
  const ct = Buffer.alloc(KEY_SLOT_LEN); // zero-padded
  for (let i = 0; i < keyBytes.length; i++) {
    ct[i] = keyBytes[i] ^ nonce[i % NONCE_LEN];
  }

  buf.writeUInt16BE(keyBytes.length, idx + KEY_MAGIC.length);
  nonce.copy(buf, idx + KEY_MAGIC.length + LEN_FIELD);
  ct.copy(buf, idx + KEY_MAGIC.length + LEN_FIELD + NONCE_LEN);

  Logger.debug?.('KEY_BLOB patched', {
    offset: idx,
    keyLen: keyBytes.length,
    blobLen: BLOB_LEN,
  });
  return buf;
}

function hasAnyMetadata(m: InjectMetadata): boolean {
  return META_FIELD_MAP.some(([k]) => m[k] !== undefined && m[k] !== '');
}

function toArrayBuffer(b: Buffer): ArrayBuffer {
  // Node Buffer is a view onto a (possibly larger) ArrayBuffer; slice down to
  // exactly the region this Buffer covers.
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// Exposed for unit tests; not part of the public hot path.
export const __test = {
  patchKeyBlob,
  KEY_MAGIC,
  BLOB_LEN,
  KEY_SLOT_LEN,
  NONCE_LEN,
  LEN_FIELD,
};
