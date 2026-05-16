#!/usr/bin/env node
/*
 * Recover the NoBC OS source code from a Vercel deployment.
 *
 * Past sessions deployed the app to Vercel with the CLI but never pushed the
 * source to GitHub. Vercel keeps the uploaded source file tree for CLI
 * deployments, so this script downloads it back.
 *
 * Usage:
 *   1. Create a Vercel access token: https://vercel.com/account/settings/tokens
 *   2. VERCEL_TOKEN=xxxxx node scripts/recover-from-vercel.mjs
 *   3. Review the files written to ./recovered, then move them into place.
 *
 * Optional env vars:
 *   VERCEL_DEPLOYMENT_ID  (default: latest known production deployment)
 *   VERCEL_TEAM_ID        (default: Adam Semien's team)
 *   OUT_DIR               (default: recovered)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";

const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID || "team_VBRbe1pQDxy6mGN11pdM11AQ";
const DEPLOYMENT_ID = process.env.VERCEL_DEPLOYMENT_ID || "dpl_4FdgkA9Mj4kKKJzmnvyYfCgTLBk1";
const OUT_DIR = process.env.OUT_DIR || "recovered";
const API = "https://api.vercel.com";

if (!TOKEN) {
  console.error("Missing VERCEL_TOKEN. Create one at https://vercel.com/account/settings/tokens");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };
const q = `teamId=${TEAM_ID}`;

async function getTree() {
  const res = await fetch(`${API}/v6/deployments/${DEPLOYMENT_ID}/files?${q}`, { headers });
  if (!res.ok) throw new Error(`File tree request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function getFile(uid) {
  const res = await fetch(`${API}/v7/deployments/${DEPLOYMENT_ID}/files/${uid}?${q}`, { headers });
  if (!res.ok) throw new Error(`File ${uid} failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Vercel may wrap content as {"data": "<base64>", "encoding": "base64"}.
  // Only unwrap when the object has exactly those two keys (real source
  // files never look like that).
  try {
    const j = JSON.parse(buf.toString("utf8"));
    const keys = Object.keys(j).sort().join(",");
    if (keys === "data,encoding" && typeof j.data === "string") {
      return Buffer.from(j.data, j.encoding === "base64" ? "base64" : "utf8");
    }
  } catch {
    /* not JSON-wrapped — raw file content */
  }
  return buf;
}

let written = 0;

async function walk(entries, prefix = "") {
  for (const entry of entries) {
    const rel = join(prefix, entry.name);
    if (entry.type === "directory") {
      await walk(entry.children || [], rel);
    } else if (entry.type === "file" && entry.uid) {
      const dest = join(OUT_DIR, rel);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, await getFile(entry.uid));
      written += 1;
      console.log(`  ${rel}`);
    }
  }
}

console.log(`Recovering deployment ${DEPLOYMENT_ID}`);
console.log(`Writing to ./${OUT_DIR}/\n`);

const tree = await getTree();
await walk(Array.isArray(tree) ? tree : tree.files || []);

console.log(`\nDone — ${written} files recovered into ./${OUT_DIR}/`);
console.log("Review them, then replace the repo contents and commit.");
