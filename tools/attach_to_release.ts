import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import process from "node:process";
import { Octokit } from "@octokit/rest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ZIP_PATH = path.join(ROOT, "dist", "store_v1.2.zip");

const tagName = "v1.2";

const gitTagExists = (): boolean => {
  try {
    execSync(`git rev-parse --verify ${tagName}`, { stdio: "ignore", cwd: ROOT });
    return true;
  } catch {
    return false;
  }
};

const parseRepo = (remoteUrl: string): { owner: string; repo: string } | null => {
  const sshMatch = remoteUrl.match(/git@[^:]+:([^/]+)\/([^/]+?)(\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  try {
    const url = new URL(remoteUrl);
    const segments = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (segments.length >= 2) {
      return { owner: segments[0], repo: segments[1] };
    }
  } catch {
    // ignore
  }
  return null;
};

const resolveRepo = (): { owner: string; repo: string } => {
  const remote = execSync("git config --get remote.origin.url", { cwd: ROOT }).toString().trim();
  const parsed = parseRepo(remote);
  if (!parsed) {
    throw new Error(`Unable to parse repository from remote URL: ${remote}`);
  }
  return parsed;
};

const attachAsset = async () => {
  if (!gitTagExists()) {
    console.log(`[store:attach] Tag ${tagName} not found. Upload skipped.`);
    return;
  }

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("[store:attach] GH_TOKEN not provided. Upload skipped.");
    return;
  }

  try {
    await readFile(ZIP_PATH);
  } catch {
    console.log(`[store:attach] Missing asset at ${ZIP_PATH}. Run store:zip first.`);
    return;
  }

  const { owner, repo } = resolveRepo();
  const octokit = new Octokit({ auth: token });

  let release;
  try {
    release = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag: tagName });
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      console.log(`[store:attach] Release for ${tagName} not found in ${owner}/${repo}.`);
      return;
    }
    throw error;
  }

  const assetName = path.basename(ZIP_PATH);
  const existing = release.data.assets.find((asset) => asset.name === assetName);
  if (existing) {
    await octokit.rest.repos.deleteReleaseAsset({ owner, repo, asset_id: existing.id });
    console.log(`[store:attach] Removed existing asset ${assetName}.`);
  }

  const data = await readFile(ZIP_PATH);

  await octokit.rest.repos.uploadReleaseAsset({
    owner,
    repo,
    release_id: release.data.id,
    name: assetName,
    data,
    headers: {
      "content-type": "application/zip",
      "content-length": data.byteLength,
    },
  });

  console.log(`[store:attach] Uploaded ${assetName} to release ${release.data.html_url}.`);
};

attachAsset().catch((error) => {
  console.error("[store:attach] Failed to upload asset", error);
  process.exitCode = 1;
});
