#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

async function resolveAppVersion() {
  if (process.env.APP_VERSION) {
    return String(process.env.APP_VERSION);
  }
  try {
    const pkgPath = resolve(process.cwd(), 'golfiq/app/package.json');
    const contents = await readFile(pkgPath, 'utf8');
    const parsed = JSON.parse(contents);
    if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch (error) {
    console.warn('[write-version-json] unable to read app package.json', error);
  }
  return '0.0.0-dev';
}

function resolveBuildNumber() {
  const explicit =
    process.env.APP_BUILD_NUMBER ??
    process.env.BUILD_NUMBER ??
    process.env.GITHUB_RUN_NUMBER ??
    process.env.CIRCLE_BUILD_NUM ??
    process.env.BITRISE_BUILD_NUMBER;
  if (explicit && String(explicit).trim()) {
    return String(explicit).trim();
  }
  return '0';
}

function resolveGitSha() {
  const sha = process.env.GIT_SHA ?? process.env.GITHUB_SHA ?? '';
  const cleaned = String(sha).trim();
  if (cleaned) {
    return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
  }
  return 'dev';
}

function toIsoTimestamp(date = new Date()) {
  return date.toISOString();
}

async function writeManifest() {
  const appVersion = await resolveAppVersion();
  const buildNumber = resolveBuildNumber();
  const gitSha = resolveGitSha();
  const builtAtUTC = toIsoTimestamp();

  const payload = {
    appVersion,
    buildNumber,
    gitSha,
    builtAtUTC,
  };

  const target = resolve(process.cwd(), 'shared/app/version.json');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[write-version-json] wrote ${target}`);
  console.log(`[write-version-json] ${appVersion} (${buildNumber}) @ ${gitSha}`);
}

writeManifest().catch((error) => {
  console.error('[write-version-json] failed to write manifest', error);
  process.exitCode = 1;
});
