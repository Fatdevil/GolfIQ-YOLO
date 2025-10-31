const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const len = bytes.length;
  let result = '';
  let i = 0;
  while (i + 2 < len) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      BASE64_ALPHABET[(triplet >> 18) & 0x3f] +
      BASE64_ALPHABET[(triplet >> 12) & 0x3f] +
      BASE64_ALPHABET[(triplet >> 6) & 0x3f] +
      BASE64_ALPHABET[triplet & 0x3f];
    i += 3;
  }
  if (i < len) {
    const remaining = len - i;
    let triplet = bytes[i] << 16;
    if (remaining === 2) {
      triplet |= bytes[i + 1] << 8;
    }
    result += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
    result += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
    if (remaining === 2) {
      result += BASE64_ALPHABET[(triplet >> 6) & 0x3f];
      result += '=';
    } else {
      result += '==';
    }
  }
  return result;
}

function normalizeBase64(input: string | undefined): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  return input.replace(/\s+/g, '').replace(/=+$/u, '');
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function sha256Fallback(bytes: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);

  const originalLengthBits = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, originalLengthBits >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(originalLengthBits / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (((w[i - 16] + s0) >>> 0) + ((w[i - 7] + s1) >>> 0)) >>> 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, H[i]);
  }
  return digest;
}

function tryGetSubtle(): SubtleCrypto | null {
  const maybeCrypto = typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (maybeCrypto?.subtle) {
    return maybeCrypto.subtle;
  }
  return null;
}

type ExpoCryptoGlobal = {
  digestAsync?: (algorithm: string, data: Uint8Array) => Promise<Uint8Array>;
};

async function tryExpoCrypto(bytes: Uint8Array): Promise<string | null> {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const globalObject = globalThis as typeof globalThis & { ExpoCrypto?: ExpoCryptoGlobal | undefined };
  const digestAsync = globalObject.ExpoCrypto?.digestAsync;
  if (typeof digestAsync !== 'function') {
    return null;
  }
  try {
    const digestBytes = await digestAsync('SHA-256', bytes);
    if (digestBytes instanceof Uint8Array) {
      return bytesToBase64(digestBytes);
    }
  } catch {
    return null;
  }
  return null;
}

export async function sha256Base64(bytes: Uint8Array): Promise<string> {
  const subtle = tryGetSubtle();
  if (subtle) {
    try {
      const sourceBuffer =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer
          : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const digest = await subtle.digest('SHA-256', sourceBuffer as ArrayBuffer);
      return bytesToBase64(new Uint8Array(digest));
    } catch {
      // ignore and fall back
    }
  }
  const expoDigest = await tryExpoCrypto(bytes);
  if (expoDigest) {
    return expoDigest;
  }
  const digestBytes = sha256Fallback(bytes);
  return bytesToBase64(digestBytes);
}

export function equalB64(a?: string, b?: string): boolean {
  const normalizedA = normalizeBase64(a);
  const normalizedB = normalizeBase64(b);
  if (normalizedA === null || normalizedB === null) {
    return false;
  }
  return normalizedA === normalizedB;
}
