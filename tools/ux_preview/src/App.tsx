import { strToU8, zipSync } from 'fflate';
import { useMemo, useState } from 'react';
import { ExplainCard } from './components/ExplainCard';
import { HudCard } from './components/HudCard';
import { JsonViewer } from './components/JsonViewer';
import { MicroCoachCard } from './components/MicroCoachCard';
import { PayloadInput } from './components/PayloadInput';
import { PayloadPicker } from './components/PayloadPicker';
import { SummaryHeader } from './components/SummaryHeader';
import { parsePayload } from './helpers/parsePayload';

const EXAMPLE_OPTIONS = ['ready', 'warn', 'block'] as const;

type ExampleKey = (typeof EXAMPLE_OPTIONS)[number];

export default function App() {
  const [payloadInput, setPayloadInput] = useState('');
  const [selectedExample, setSelectedExample] = useState<ExampleKey>('ready');
  const [baseUrl, setBaseUrl] = useState('http://localhost:8000');
  const [actionMessage, setActionMessage] = useState('');
  const [actionTone, setActionTone] = useState<'info' | 'error'>('info');
  const [isFetching, setIsFetching] = useState<null | 'swing' | 'range'>(null);

  const parseResult = useMemo(() => parsePayload(payloadInput), [payloadInput]);
  const normalizedPayload = parseResult.normalized;

  const handleLoadExample = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}examples/${selectedExample}.json`
      );
      if (!response.ok) {
        throw new Error('Failed to load example');
      }
      const data = await response.json();
      setPayloadInput(JSON.stringify(data, null, 2));
      setActionTone('info');
      setActionMessage(`Loaded ${selectedExample.toUpperCase()} example.`);
    } catch (error) {
      setActionTone('error');
      setActionMessage('Could not load example JSON.');
    }
  };

  const handleClear = () => {
    setPayloadInput('');
    setActionTone('info');
    setActionMessage('Cleared payload input.');
  };

  const handleCopy = async () => {
    if (!normalizedPayload) {
      setActionTone('error');
      setActionMessage('No payload to copy yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(normalizedPayload, null, 2)
      );
      setActionTone('info');
      setActionMessage('Normalized payload copied to clipboard.');
    } catch (error) {
      setActionTone('error');
      setActionMessage('Copy failed. Please copy manually from Raw JSON.');
    }
  };

  const normalizeBaseUrl = () => baseUrl.replace(/\/+$/, '');

  const extractErrorMessage = async (response: Response) => {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      return trimmed.slice(0, 160);
    }
    return response.statusText || 'Unknown error';
  };

  const buildDemoFramesZipBytes = () => {
    const files: Record<string, Uint8Array> = {
      '000001.jpg': strToU8('demo'),
      '000002.jpg': strToU8('demo'),
      '000003.jpg': strToU8('demo'),
    };
    return zipSync(files, { level: 0 });
  };

  const appendErrorHint = (message: string, status?: number) => {
    if (status === 405 || status === 422) {
      return `${message} (Tip: this endpoint expects POST + payload and demo=true.)`;
    }
    return message;
  };

  const handleFetchSwing = async () => {
    try {
      setIsFetching('swing');
      setActionMessage('');
      const zipBytes = buildDemoFramesZipBytes();
      const file = new File([zipBytes], 'frames.zip', {
        type: 'application/zip',
      });
      const body = new FormData();
      body.append('frames_zip', file);

      const response = await fetch(
        `${normalizeBaseUrl()}/cv/analyze?demo=true`,
        {
          method: 'POST',
          body,
        }
      );
      if (!response.ok) {
        const detail = await extractErrorMessage(response);
        throw new Error(
          appendErrorHint(
            `Swing demo failed (${response.status}): ${detail}`,
            response.status
          )
        );
      }
      const data = await response.json();
      setPayloadInput(JSON.stringify(data, null, 2));
      setActionTone('info');
      setActionMessage('Fetched demo swing payload successfully.');
    } catch (error) {
      setActionTone('error');
      setActionMessage(
        error instanceof Error
          ? error.message
          : 'Could not fetch demo swing payload.'
      );
    } finally {
      setIsFetching(null);
    }
  };

  const handleFetchRange = async () => {
    try {
      setIsFetching('range');
      setActionMessage('');
      const response = await fetch(
        `${normalizeBaseUrl()}/range/practice/analyze?demo=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frames: 8,
            demo: true,
            fps: 30,
            ref_len_m: 1.0,
            ref_len_px: 1000,
            smoothing_window: 5,
          }),
        }
      );
      if (!response.ok) {
        const detail = await extractErrorMessage(response);
        throw new Error(
          appendErrorHint(
            `Range demo failed (${response.status}): ${detail}`,
            response.status
          )
        );
      }
      const data = await response.json();
      setPayloadInput(JSON.stringify(data, null, 2));
      setActionTone('info');
      setActionMessage('Fetched demo range payload successfully.');
    } catch (error) {
      setActionTone('error');
      setActionMessage(
        error instanceof Error
          ? error.message
          : 'Could not fetch demo range payload.'
      );
    } finally {
      setIsFetching(null);
    }
  };

  return (
    <div className="app">
      {normalizedPayload ? (
        <SummaryHeader payload={normalizedPayload} />
      ) : (
        <div className="summary-header">
          <div>
            <h1>GolfIQ UX Preview</h1>
            <p className="subtitle">Unified ux_payload_v1 renderer</p>
          </div>
          <div className="summary-meta">
            <span className="pill pill-unknown">Waiting</span>
            <div className="meta-block">
              <span className="meta-label">Mode</span>
              <span className="meta-value">N/A</span>
            </div>
            <div className="meta-block">
              <span className="meta-label">Confidence</span>
              <span className="meta-value">N/A</span>
            </div>
          </div>
        </div>
      )}

      <div className="layout">
        <div className="column">
          <PayloadPicker
            selected={selectedExample}
            onSelect={(value) => setSelectedExample(value as ExampleKey)}
            onLoad={handleLoadExample}
            onClear={handleClear}
            onCopy={handleCopy}
          />

          <div className="card">
            <h3>Fetch demo payload</h3>
            <label className="label">
              Base URL
              <input
                type="text"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://localhost:8000"
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                onClick={handleFetchSwing}
                disabled={isFetching !== null}
              >
                {isFetching === 'swing' ? 'Fetching swing…' : 'Fetch demo swing'}
              </button>
              <button
                type="button"
                onClick={handleFetchRange}
                className="secondary"
                disabled={isFetching !== null}
              >
                {isFetching === 'range' ? 'Fetching range…' : 'Fetch demo range'}
              </button>
            </div>
          </div>

          <PayloadInput value={payloadInput} onChange={setPayloadInput} />

          {parseResult.error ? (
            <div className="card error">{parseResult.error}</div>
          ) : null}
          {actionMessage ? (
            <div className={`card ${actionTone}`}>{actionMessage}</div>
          ) : null}
        </div>

        <div className="column">
          {normalizedPayload ? (
            <>
              <HudCard payload={normalizedPayload} />
              <ExplainCard payload={normalizedPayload} />
              <MicroCoachCard payload={normalizedPayload} />
              <JsonViewer data={normalizedPayload} />
            </>
          ) : (
            <div className="card empty">
              Paste or load a payload to preview the UX cards.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
