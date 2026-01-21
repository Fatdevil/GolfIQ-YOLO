export function JsonViewer({ data }: { data: unknown }) {
  return (
    <details className="card">
      <summary>Raw JSON</summary>
      <pre className="json-viewer">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}
