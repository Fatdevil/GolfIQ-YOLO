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
      setActionMessage(`Loaded ${selectedExample.toUpperCase()} example.`);
    } catch (error) {
      setActionMessage('Could not load example JSON.');
    }
  };

  const handleClear = () => {
    setPayloadInput('');
    setActionMessage('Cleared payload input.');
  };

  const handleCopy = async () => {
    if (!normalizedPayload) {
      setActionMessage('No payload to copy yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(normalizedPayload, null, 2)
      );
      setActionMessage('Normalized payload copied to clipboard.');
    } catch (error) {
      setActionMessage('Copy failed. Please copy manually from Raw JSON.');
    }
  };

  const handleFetch = async (path: string) => {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) {
        throw new Error('Fetch failed');
      }
      const data = await response.json();
      setPayloadInput(JSON.stringify(data, null, 2));
      setActionMessage('Fetched demo payload successfully.');
    } catch (error) {
      setActionMessage('Could not fetch demo payload. Is the server running?');
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
                onClick={() => handleFetch('/cv/analyze?demo=true')}
              >
                Fetch demo swing
              </button>
              <button
                type="button"
                onClick={() => handleFetch('/range/practice/analyze?demo=true')}
                className="secondary"
              >
                Fetch demo range
              </button>
            </div>
          </div>

          <PayloadInput value={payloadInput} onChange={setPayloadInput} />

          {parseResult.error ? (
            <div className="card error">{parseResult.error}</div>
          ) : null}
          {actionMessage ? (
            <div className="card info">{actionMessage}</div>
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
