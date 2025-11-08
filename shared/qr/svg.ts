const VERSION = 6;
const ERROR_CORRECTION_LEVEL_BITS = 0b00; // Level M
const MODULE_COUNT = VERSION * 4 + 17; // 41
const ALIGNMENT_POSITIONS = [6, 22, 38];
const DATA_CODEWORDS_PER_BLOCK = 27;
const TOTAL_BLOCKS = 4;
const TOTAL_DATA_CODEWORDS = DATA_CODEWORDS_PER_BLOCK * TOTAL_BLOCKS; // 108
const ECC_CODEWORDS_PER_BLOCK = 16;
const QUIET_ZONE = 4;

type Matrix = Array<Array<boolean | null>>;

const GF256_EXP: number[] = new Array(512);
const GF256_LOG: number[] = new Array(256);

function initTables(): void {
  if (GF256_EXP[0]) {
    return;
  }
  let x = 1;
  for (let i = 0; i < 256; i += 1) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 256; i < 512; i += 1) {
    GF256_EXP[i] = GF256_EXP[i - 256];
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  const log = GF256_LOG[a] + GF256_LOG[b];
  return GF256_EXP[log % 255];
}

function polynomialMultiply(a: number[], b: number[]): number[] {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      result[i + j] ^= gfMul(a[i]!, b[j]!);
    }
  }
  return result;
}

const generatorCache = new Map<number, number[]>();

function generatorPolynomial(length: number): number[] {
  const cached = generatorCache.get(length);
  if (cached) {
    return cached;
  }
  let poly = [1];
  for (let i = 0; i < length; i += 1) {
    poly = polynomialMultiply(poly, [1, GF256_EXP[i]!]);
  }
  generatorCache.set(length, poly);
  return poly;
}

function reedSolomonEncode(data: number[], ecLength: number): number[] {
  const gen = generatorPolynomial(ecLength);
  const ec = new Array(ecLength).fill(0);
  for (const value of data) {
    const factor = value ^ ec[0]!;
    for (let i = 0; i < ecLength - 1; i += 1) {
      ec[i] = ec[i + 1]!;
    }
    ec[ecLength - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLength; j += 1) {
        ec[j] ^= gfMul(gen[j]!, factor);
      }
    }
  }
  return ec;
}

function textToBytes(input: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input);
  }
  const buffer: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      buffer.push(code);
    } else if (code < 0x800) {
      buffer.push(0xc0 | (code >> 6));
      buffer.push(0x80 | (code & 0x3f));
    } else {
      buffer.push(0xe0 | (code >> 12));
      buffer.push(0x80 | ((code >> 6) & 0x3f));
      buffer.push(0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(buffer);
}

function buildBitBuffer(data: Uint8Array): number[] {
  const bits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((value >> i) & 1);
    }
  };

  // Mode: Byte
  pushBits(0b0100, 4);
  // Character count indicator (version < 10 -> 8 bits)
  pushBits(data.length, 8);
  for (const byte of data) {
    pushBits(byte, 8);
  }

  const maxBits = TOTAL_DATA_CODEWORDS * 8;
  const remaining = maxBits - bits.length;
  if (remaining > 0) {
    const terminator = Math.min(4, remaining);
    pushBits(0, terminator);
  }

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (bits.length < maxBits) {
    const pad = padBytes[padIndex % padBytes.length]!;
    padIndex += 1;
    pushBits(pad, 8);
  }

  return bits;
}

function bitsToCodewords(bits: number[]): number[] {
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) {
      value = (value << 1) | bits[i + j]!;
    }
    codewords.push(value);
  }
  return codewords;
}

function createInterleavedCodewords(dataCodewords: number[]): number[] {
  const blocks: number[][] = [];
  for (let i = 0; i < TOTAL_BLOCKS; i += 1) {
    const start = i * DATA_CODEWORDS_PER_BLOCK;
    blocks.push(dataCodewords.slice(start, start + DATA_CODEWORDS_PER_BLOCK));
  }

  const ecBlocks = blocks.map((block) => reedSolomonEncode(block, ECC_CODEWORDS_PER_BLOCK));

  const result: number[] = [];
  for (let i = 0; i < DATA_CODEWORDS_PER_BLOCK; i += 1) {
    for (let b = 0; b < TOTAL_BLOCKS; b += 1) {
      result.push(blocks[b]![i]!);
    }
  }
  for (let i = 0; i < ECC_CODEWORDS_PER_BLOCK; i += 1) {
    for (let b = 0; b < TOTAL_BLOCKS; b += 1) {
      result.push(ecBlocks[b]![i]!);
    }
  }
  return result;
}

function emptyMatrix(): Matrix {
  return Array.from({ length: MODULE_COUNT }, () => new Array<boolean | null>(MODULE_COUNT).fill(null));
}

function placeFinder(matrix: Matrix, row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    const rr = row + r;
    if (rr < 0 || rr >= MODULE_COUNT) continue;
    for (let c = -1; c <= 7; c += 1) {
      const cc = col + c;
      if (cc < 0 || cc >= MODULE_COUNT) continue;
      let value = false;
      if (0 <= r && r <= 6 && (c === 0 || c === 6)) {
        value = true;
      } else if (0 <= c && c <= 6 && (r === 0 || r === 6)) {
        value = true;
      } else if (2 <= r && r <= 4 && 2 <= c && c <= 4) {
        value = true;
      }
      matrix[rr]![cc] = value;
    }
  }
}

function placeAlignment(matrix: Matrix, row: number, col: number): void {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= MODULE_COUNT || cc < 0 || cc >= MODULE_COUNT) continue;
      const dist = Math.max(Math.abs(r), Math.abs(c));
      matrix[rr]![cc] = dist !== 1;
    }
  }
}

function placeTiming(matrix: Matrix): void {
  for (let i = 0; i < MODULE_COUNT; i += 1) {
    const value = i % 2 === 0;
    if (matrix[6]![i] === null) {
      matrix[6]![i] = value;
    }
    if (matrix[i]![6] === null) {
      matrix[i]![6] = value;
    }
  }
}

function placeDarkModule(matrix: Matrix): void {
  matrix[MODULE_COUNT - 8]![8] = true;
}

function reserveFormatAreas(matrix: Matrix): void {
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      matrix[8]![i] ??= false;
      matrix[i]![8] ??= false;
    }
  }
  for (let i = MODULE_COUNT - 8; i < MODULE_COUNT; i += 1) {
    matrix[8]![i] ??= false;
    matrix[i]![8] ??= false;
  }
}

function buildBaseMatrix(): Matrix {
  const matrix = emptyMatrix();
  placeFinder(matrix, 0, 0);
  placeFinder(matrix, MODULE_COUNT - 7, 0);
  placeFinder(matrix, 0, MODULE_COUNT - 7);
  placeTiming(matrix);
  for (const row of ALIGNMENT_POSITIONS) {
    for (const col of ALIGNMENT_POSITIONS) {
      const overlap =
        (row <= 8 && col <= 8) ||
        (row <= 8 && col >= MODULE_COUNT - 8) ||
        (row >= MODULE_COUNT - 8 && col <= 8);
      if (overlap) continue;
      placeAlignment(matrix, row, col);
    }
  }
  placeDarkModule(matrix);
  reserveFormatAreas(matrix);
  return matrix;
}

function mapData(matrix: Matrix, codewords: number[], maskPattern: number): void {
  let row = MODULE_COUNT - 1;
  let col = MODULE_COUNT - 1;
  let direction = -1;
  let bitIndex = 0;

  const totalBits = codewords.length * 8;

  const getBit = (index: number) => {
    if (index >= totalBits) return 0;
    const byteIndex = Math.floor(index / 8);
    const bitPos = 7 - (index % 8);
    return (codewords[byteIndex]! >> bitPos) & 1;
  };

  for (col = MODULE_COUNT - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < MODULE_COUNT; i += 1) {
      const r = direction === -1 ? MODULE_COUNT - 1 - i : i;
      for (let j = 0; j < 2; j += 1) {
        const c = col - j;
        if (matrix[r]![c] !== null) continue;
        let dark = getBit(bitIndex) === 1;
        bitIndex += 1;
        const mask = getMask(maskPattern, r, c);
        if (mask) {
          dark = !dark;
        }
        matrix[r]![c] = dark;
      }
    }
    direction *= -1;
  }
}

function getMask(maskPattern: number, row: number, col: number): boolean {
  switch (maskPattern) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2 + (row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function computeFormatBits(maskPattern: number): number {
  const data = (ERROR_CORRECTION_LEVEL_BITS << 3) | maskPattern;
  let bits = data << 10;
  const generator = 0b10100110111;
  const getMsb = (value: number): number => {
    let msb = 0;
    while (value >= (1 << (msb + 1))) {
      msb += 1;
    }
    return msb;
  };

  while (getMsb(bits) >= 10) {
    const shift = getMsb(bits) - 10;
    bits ^= generator << shift;
  }
  const format = ((data << 10) | bits) ^ 0b101010000010010;
  return format & 0xffff;
}

function applyFormatBits(matrix: Matrix, maskPattern: number): void {
  const format = computeFormatBits(maskPattern);

  for (let i = 0; i < 15; i += 1) {
    const bit = ((format >> i) & 1) === 1;
    if (i < 6) {
      matrix[i]![8] = bit;
    } else if (i === 6) {
      matrix[i + 1]![8] = bit;
    } else if (i < 8) {
      matrix[i + 1]![8] = bit;
    } else {
      matrix[MODULE_COUNT - 15 + i]![8] = bit;
    }
  }

  for (let i = 0; i < 15; i += 1) {
    const bit = ((format >> i) & 1) === 1;
    if (i < 8) {
      matrix[8]![MODULE_COUNT - 1 - i] = bit;
    } else if (i === 8) {
      matrix[8]![15 - i] = bit;
    } else {
      matrix[8]![15 - i + 1] = bit;
    }
  }
  matrix[MODULE_COUNT - 8]![8] = true;
}

function scoreMatrix(matrix: Matrix): number {
  let penalty = 0;

  // Rule 1: rows
  for (let r = 0; r < MODULE_COUNT; r += 1) {
    let runColor: boolean | null = null;
    let runLength = 0;
    for (let c = 0; c < MODULE_COUNT; c += 1) {
      const value = matrix[r]![c]!;
      if (value === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) {
          penalty += 3 + (runLength - 5);
        }
        runColor = value;
        runLength = 1;
      }
    }
    if (runLength >= 5) {
      penalty += 3 + (runLength - 5);
    }
  }

  // Rule 1: columns
  for (let c = 0; c < MODULE_COUNT; c += 1) {
    let runColor: boolean | null = null;
    let runLength = 0;
    for (let r = 0; r < MODULE_COUNT; r += 1) {
      const value = matrix[r]![c]!;
      if (value === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) {
          penalty += 3 + (runLength - 5);
        }
        runColor = value;
        runLength = 1;
      }
    }
    if (runLength >= 5) {
      penalty += 3 + (runLength - 5);
    }
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < MODULE_COUNT - 1; r += 1) {
    for (let c = 0; c < MODULE_COUNT - 1; c += 1) {
      const v = matrix[r]![c]!;
      if (
        v === matrix[r]![c + 1]! &&
        v === matrix[r + 1]![c]! &&
        v === matrix[r + 1]![c + 1]!
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 3: finder-like patterns
  const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];

  const checkPattern = (row: boolean[], pattern: boolean[]) => {
    for (let i = 0; i <= row.length - pattern.length; i += 1) {
      let matches = true;
      for (let j = 0; j < pattern.length; j += 1) {
        if (row[i + j] !== pattern[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        penalty += 40;
      }
    }
  };

  for (let r = 0; r < MODULE_COUNT; r += 1) {
    const row = matrix[r]!.map((v) => Boolean(v));
    checkPattern(row, pattern1);
    checkPattern(row, pattern2);
  }
  for (let c = 0; c < MODULE_COUNT; c += 1) {
    const col: boolean[] = [];
    for (let r = 0; r < MODULE_COUNT; r += 1) {
      col.push(Boolean(matrix[r]![c]));
    }
    checkPattern(col, pattern1);
    checkPattern(col, pattern2);
  }

  // Rule 4: dark ratio
  let darkCount = 0;
  for (let r = 0; r < MODULE_COUNT; r += 1) {
    for (let c = 0; c < MODULE_COUNT; c += 1) {
      if (matrix[r]![c]) {
        darkCount += 1;
      }
    }
  }
  const totalCount = MODULE_COUNT * MODULE_COUNT;
  const percent = (darkCount * 100) / totalCount;
  const fivePercent = Math.abs(Math.floor(percent / 5) - 10);
  penalty += fivePercent * 10;

  return penalty;
}

function cloneMatrix(source: Matrix): Matrix {
  return source.map((row) => row.slice()) as Matrix;
}

function buildMatrixForMask(codewords: number[], maskPattern: number): Matrix {
  const matrix = buildBaseMatrix();
  const working = cloneMatrix(matrix);
  mapData(working, codewords, maskPattern);
  applyFormatBits(working, maskPattern);
  return working;
}

function selectBestMask(codewords: number[]): Matrix {
  let bestMatrix: Matrix | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = buildMatrixForMask(codewords, mask);
    const score = scoreMatrix(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMatrix = candidate;
    }
  }
  if (!bestMatrix) {
    throw new Error('unable to build QR matrix');
  }
  return bestMatrix;
}

function matrixToSvgPath(matrix: Matrix, scale: number): string {
  const commands: string[] = [];
  const margin = QUIET_ZONE * scale;
  for (let r = 0; r < MODULE_COUNT; r += 1) {
    for (let c = 0; c < MODULE_COUNT; c += 1) {
      if (!matrix[r]![c]) continue;
      const x = margin + c * scale;
      const y = margin + r * scale;
      commands.push(`M${x} ${y}h${scale}v${scale}h-${scale}z`);
    }
  }
  return commands.join('');
}

export function qrSvg(data: string, size = 192): string {
  if (!data) {
    throw new Error('data is required for qrSvg');
  }
  initTables();
  const payload = textToBytes(data);
  if (payload.length > TOTAL_DATA_CODEWORDS) {
    throw new Error('payload too large for QR version 6-M');
  }
  const bits = buildBitBuffer(payload);
  const dataCodewords = bitsToCodewords(bits);
  const codewords = createInterleavedCodewords(dataCodewords);
  const matrix = selectBestMask(codewords);

  const moduleTotal = MODULE_COUNT + QUIET_ZONE * 2;
  const scale = Math.max(1, Math.floor(size / moduleTotal));
  const dimension = moduleTotal * scale;
  const path = matrixToSvgPath(matrix, scale);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="${dimension}" height="${dimension}" shape-rendering="crispEdges"><rect width="${dimension}" height="${dimension}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export const __testing = {
  buildBitBuffer,
  bitsToCodewords,
  createInterleavedCodewords,
  selectBestMask,
  buildBaseMatrix,
  matrixToSvgPath,
};

