import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";
import puppeteer, { Browser, Page } from "puppeteer";

interface PreviewHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SCREEN_DIR = path.join(ROOT, "dist", "screens");

const parseArgs = () => {
  const args = process.argv.slice(2);
  let base: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current === "--base" && args[i + 1]) {
      base = args[i + 1];
      i += 1;
    }
  }
  return { base };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const startPreview = async (): Promise<PreviewHandle> => {
  const port = 4173;
  const child = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: path.join(ROOT, "web"),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" },
  });

  let resolved = false;
  let collected = "";

  const cleanup = async () => {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  };

  return new Promise<PreviewHandle>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup().finally(() => {
          reject(new Error("Timed out waiting for Vite preview server to start"));
        });
      }
    }, 15000);

    const onData = (buffer: Buffer) => {
      if (resolved) return;
      collected += buffer.toString();
      const match = collected.match(/https?:\/\/(127\.0\.0\.1|localhost):\d+/);
      if (match) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          baseUrl: match[0],
          close: async () => {
            await cleanup();
          },
        });
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", (data) => {
      collected += data.toString();
    });

    child.on("exit", (code) => {
      if (!resolved) {
        clearTimeout(timeout);
        reject(new Error(`Preview server exited early with code ${code ?? "unknown"}`));
      }
    });
  });
};

const ensureScreensDir = async () => {
  await mkdir(SCREEN_DIR, { recursive: true });
};

const runList = [
  {
    run_id: "RUN-2409-ALPHA",
    created_ts: "2025-09-24T16:03:00Z",
    source: "hud", 
    mode: "detector",
    confidence: 0.982,
    ball_speed_mps: 71.4,
  },
  {
    run_id: "RUN-2409-BETA",
    created_ts: "2025-09-20T14:55:00Z",
    source: "field-test",
    mode: "sim", 
    confidence: 0.941,
    ball_speed_mps: 68.1,
  },
  {
    run_id: "RUN-2408-GAMMA",
    created_ts: "2025-08-30T09:12:00Z",
    source: "simulator",
    mode: "detector",
    confidence: 0.901,
    ball_speed_mps: 64.2,
  },
];

const runDetailPayload = {
  run_id: "RUN-2409-ALPHA",
  headers: {
    "x-cv-source": "hud-back",
  },
  impact_preview: "https://example.com/impact_preview.zip",
  analysis: {
    metrics: {
      ballSpeedMps: 71.4,
      clubSpeedMps: 45.2,
      carry: 204.3,
      vertLaunch: 14.3,
      sideAngle: -2.1,
    },
  },
  back_view: {
    width: 1280,
    height: 720,
    normalized: true,
    points: [
      { x: 0.15, y: 0.1, t: 0 },
      { x: 0.2, y: 0.18, t: 25 },
      { x: 0.32, y: 0.3, t: 50 },
      { x: 0.55, y: 0.46, t: 75 },
      { x: 0.74, y: 0.58, t: 100 },
      { x: 0.88, y: 0.72, t: 125 },
    ],
    ghosts: [
      { label: "Address", frameIndex: 0 },
      { label: "Top", frameIndex: 45 },
      { label: "Impact", frameIndex: 90 },
    ],
    quality: {
      tracking: "stable",
      drift: "<0.2m",
      fps: "240",
    },
    source: "hud-back",
    video_url: "https://example.com/backview.mp4",
  },
};

const mockResult = {
  run_id: "RUN-MOCK-ARHUD",
  metrics: {
    ball_speed_mps: 70.2,
    club_speed_mps: 44.6,
    launch_deg: 13.9,
    carry_m: 203.5,
    confidence: 0.97,
    spin_rpm: 2700,
    spin_axis_deg: -3.2,
    club_path_deg: 1.4,
  },
  events: [
    { ts: 0, event: "swing_address" },
    { ts: 320, event: "impact", club: "7i" },
    { ts: 1400, event: "apex", height_m: 28 },
  ],
};

const coachHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Coach Feedback</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #020617;
        color: #f8fafc;
      }
      body {
        margin: 0;
        padding: 48px;
        display: flex;
        justify-content: center;
      }
      .frame {
        width: 960px;
        border-radius: 24px;
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(14, 116, 144, 0.12));
        border: 1px solid rgba(45, 212, 191, 0.35);
        box-shadow: 0 32px 80px rgba(15, 118, 110, 0.25);
        padding: 40px;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 32px;
      }
      header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
      }
      header span {
        font-size: 14px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(226, 232, 240, 0.72);
      }
      .chat {
        display: grid;
        gap: 20px;
      }
      .bubble {
        border-radius: 18px;
        padding: 18px 20px;
        line-height: 1.6;
        font-size: 16px;
        background: rgba(2, 132, 199, 0.18);
        border: 1px solid rgba(125, 211, 252, 0.5);
        backdrop-filter: blur(12px);
      }
      .bubble strong {
        color: #38bdf8;
      }
      .bubble.user {
        justify-self: end;
        max-width: 520px;
        background: rgba(16, 185, 129, 0.2);
        border-color: rgba(52, 211, 153, 0.6);
      }
      .metrics {
        margin-top: 28px;
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
      }
      .metric {
        flex: 1 1 180px;
        padding: 16px 18px;
        border-radius: 16px;
        background: rgba(15, 118, 110, 0.2);
        border: 1px solid rgba(45, 212, 191, 0.45);
      }
      .metric span {
        display: block;
      }
      .metric span.label {
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(226, 232, 240, 0.72);
        margin-bottom: 8px;
      }
      .metric span.value {
        font-size: 24px;
        font-weight: 600;
        color: #f0fdf4;
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <header>
        <h1>Coach</h1>
        <span>Provider: OpenAI · v1.2</span>
      </header>
      <div class="chat">
        <div class="bubble">
          <strong>Coach:</strong> Ball speed of <strong>158 mph</strong> with a <strong>+1.4°</strong> path is solid. You're losing carry because attack angle stays shallow.
        </div>
        <div class="bubble">
          <strong>Coach:</strong> Try rehearsing a slightly steeper shoulder turn so the club arrives with <strong>-2°</strong> attack. That should lift launch to 16° while keeping spin below 2800 rpm.
        </div>
        <div class="bubble user">
          <strong>You:</strong> Got it. Focus on shoulder depth and taller finish.
        </div>
        <div class="bubble">
          <strong>Coach:</strong> Perfect. Re-run analyzer after three swings; flag any drift in tracer quality so HUD stays locked.
        </div>
      </div>
      <div class="metrics">
        <div class="metric">
          <span class="label">Ball Speed</span>
          <span class="value">158 mph</span>
        </div>
        <div class="metric">
          <span class="label">Launch</span>
          <span class="value">14.3°</span>
        </div>
        <div class="metric">
          <span class="label">Carry</span>
          <span class="value">223 yd</span>
        </div>
        <div class="metric">
          <span class="label">Tracer Quality</span>
          <span class="value">Stable</span>
        </div>
      </div>
    </div>
  </body>
</html>`;

const interceptRequests = async (page: Page) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return route.continue();
    }

    const pathname = parsed.pathname;
    const hostname = parsed.hostname;

    const isApiHost = ["localhost", "127.0.0.1"].includes(hostname) && (parsed.port === "8000" || parsed.port === "" || parsed.port === "80");

    if (!isApiHost) {
      return route.continue();
    }

    if (request.method() === "GET" && pathname === "/runs") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: runList }),
      });
    }

    if (request.method() === "GET" && pathname === "/runs/RUN-2409-ALPHA") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runDetailPayload),
      });
    }

    if (request.method() === "POST" && pathname === "/cv/mock/analyze") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockResult),
      });
    }

    if (request.method() === "POST" && pathname === "/coach/feedback") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          promptVersion: "v1.2",
          summary: "Focus on a steeper shoulder turn to unlock higher launch and consistent path control.",
        }),
      });
    }

    if (request.method() === "DELETE" && pathname.startsWith("/runs/")) {
      return route.fulfill({ status: 204, body: "" });
    }

    return route.continue();
  });
};

const captureRuns = async (page: Page, baseUrl: string) => {
  await page.goto(`${baseUrl}/runs`, { waitUntil: "networkidle0" });
  await page.waitForSelector("table tbody tr");
  await wait(500);
  await page.screenshot({
    path: path.join(SCREEN_DIR, "runs@2x.png"),
    fullPage: true,
  });
};

const captureRunDetail = async (page: Page, baseUrl: string) => {
  await page.goto(`${baseUrl}/runs/RUN-2409-ALPHA`, { waitUntil: "networkidle0" });
  await page.waitForSelector("pre");
  await wait(500);
  await page.screenshot({
    path: path.join(SCREEN_DIR, "run-detail@2x.png"),
    fullPage: true,
  });
};

const captureMock = async (page: Page, baseUrl: string) => {
  await page.goto(`${baseUrl}/mock`, { waitUntil: "networkidle0" });
  await page.waitForSelector("button[type=submit]");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.querySelectorAll("div.rounded-xl h2").length > 0, {
    timeout: 10000,
  });
  await wait(500);
  await page.screenshot({
    path: path.join(SCREEN_DIR, "ar-hud-mock@2x.png"),
    fullPage: true,
  });
};

const captureCoach = async (page: Page) => {
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.setContent(coachHtml, { waitUntil: "networkidle0" });
  await wait(300);
  await page.screenshot({
    path: path.join(SCREEN_DIR, "coach@2x.png"),
    fullPage: true,
  });
};

const createBrowser = async (): Promise<Browser> => {
  return puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: 1280,
      height: 720,
      deviceScaleFactor: 2,
    },
  });
};

const run = async () => {
  const { base } = parseArgs();
  await ensureScreensDir();

  let preview: PreviewHandle | null = null;
  let browser: Browser | null = null;

  try {
    const baseUrl = base ?? (await (async () => {
      console.log("[store:screens] Launching Vite preview server…");
      preview = await startPreview();
      console.log(`[store:screens] Preview running at ${preview.baseUrl}`);
      await wait(1500);
      return preview.baseUrl;
    })());

    browser = await createBrowser();
    const page = await browser.newPage();
    await interceptRequests(page);

    console.log("[store:screens] Capturing Runs list…");
    await captureRuns(page, baseUrl);
    console.log("[store:screens] Capturing Run detail…");
    await captureRunDetail(page, baseUrl);
    console.log("[store:screens] Capturing AR-HUD mock flow…");
    await captureMock(page, baseUrl);
    console.log("[store:screens] Capturing Coach narrative…");
    await captureCoach(page);

    console.log(`[store:screens] Screenshots saved to ${SCREEN_DIR}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    if (preview) {
      await preview.close();
    }
  }
};

run().catch((error) => {
  console.error("[store:screens] Failed to capture store screenshots", error);
  process.exitCode = 1;
});
