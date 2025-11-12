import process from 'node:process';

const rawBaseUrl = (process.env.DEMO_BASE_URL ?? process.env.API_BASE_URL ?? 'http://localhost:8000').trim();
const baseUrl = (rawBaseUrl || 'http://localhost:8000').replace(/\/$/, '');
const apiKey = (process.env.DEMO_API_KEY ?? process.env.API_KEY)?.trim();

if (!apiKey) {
  console.error('Missing API key. Set API_KEY or DEMO_API_KEY in your environment.');
  process.exit(1);
}

async function main(): Promise<void> {
  const endpoint = new URL('/api/dev/seed/s16', baseUrl).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey!,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Seed failed (${response.status}): ${detail || 'no response body'}`);
  }

  const payload = (await response.json()) as { eventId: string; runs: string[] };
  console.log('Seeded S16 demo data:', payload);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
