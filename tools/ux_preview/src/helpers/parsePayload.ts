import { normalizePayload, type UxPayloadV1 } from './normalizePayload';

type ParseResult = {
  payload?: UxPayloadV1;
  normalized?: UxPayloadV1;
  error?: string;
};

export function parsePayload(input: string): ParseResult {
  if (!input.trim()) {
    return { error: 'Paste JSON to preview the payload.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return { error: 'Invalid JSON. Please check formatting.' };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { error: 'Payload must be a JSON object.' };
  }

  const payloadCandidate =
    (parsed as { ux_payload_v1?: UxPayloadV1 }).ux_payload_v1 ??
    (parsed as UxPayloadV1);

  if (!payloadCandidate || typeof payloadCandidate !== 'object') {
    return { error: 'Could not find ux_payload_v1 in the payload.' };
  }

  const missing: string[] = [];
  if (!payloadCandidate.version) missing.push('version');
  if (!payloadCandidate.mode) missing.push('mode');
  if (!payloadCandidate.state) missing.push('state');

  if (missing.length > 0) {
    return {
      error: `Missing required fields: ${missing.join(', ')}.`,
    };
  }

  const normalized = normalizePayload(payloadCandidate);

  return { payload: payloadCandidate, normalized };
}
