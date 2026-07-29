import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { blob } from "https://esm.town/v/std/blob/main.ts";

const ALLOWED = new Set(["create", "join", "leave", "start", "reset", "result"]);
const MAX_OPS = 20000;
const AV_MAX_B64 = 400_000;
const AV_PATH = /^\/avatar\/([A-Za-z0-9_-]{1,40})$/;
const T_PATH = /^\/t\/([A-Za-z0-9_-]{1,40})$/;
const APP = "https://sethj-pantomath.github.io/pantopong/";

await sqlite.execute(`CREATE TABLE IF NOT EXISTS ops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  rx TEXT NOT NULL
)`);

// Val Town adds permissive CORS by default; setting any header here would
// disable all of them, so this deliberately touches none.
export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  const av = path.match(AV_PATH);
  if (av) return avatar(req, av[1]);

  const tm = path.match(T_PATH);
  if (tm) return sharePage(url.origin, tm[1]);

  if (req.method === "GET") {
    const r = await sqlite.execute("SELECT body FROM ops ORDER BY id");
    return Response.json({ ops: r.rows.map((row) => JSON.parse(String(row.body))) });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  let op: { t?: string };
  try {
    op = JSON.parse(await req.text());
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  if (!op || !op.t || !ALLOWED.has(op.t)) {
    return Response.json({ error: "unknown op" }, { status: 400 });
  }

  // One conditional INSERT: an atomic append that can't lose a concurrent
  // write, plus a runaway cap, without a read-modify-write cycle.
  const res = await sqlite.execute({
    sql: `INSERT INTO ops (body, rx)
          SELECT ?, ? WHERE (SELECT COUNT(*) FROM ops) < ?`,
    args: [JSON.stringify(op), new Date().toISOString(), MAX_OPS],
  });

  if (!res.rowsAffected) {
    return Response.json({ error: "op log full" }, { status: 507 });
  }

  return Response.json({ ok: true });
}

function esc(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

// The tournament id lives in the app's URL fragment, which never reaches a
// server — so share links point here instead. Crawlers get Open Graph tags,
// humans get bounced to the app. The redirect is JS-only on purpose: a
// meta-refresh would send some crawlers onward before they read the tags.
async function sharePage(origin: string, tid: string): Promise<Response> {
  const r = await sqlite.execute({
    sql: "SELECT body FROM ops ORDER BY id",
    args: [],
  });
  const ops = r.rows
    .map((row) => JSON.parse(String(row.body)))
    .filter((o) => o.tid === tid);

  const created = ops.find((o) => o.t === "create");
  const joined = new Set<string>();
  let started = false;
  let players = 0;
  for (const o of ops) {
    if (o.t === "join") joined.add(o.pid);
    if (o.t === "leave") joined.delete(o.pid);
    if (o.t === "start") { started = true; players = (o.seeds || []).length; }
    if (o.t === "reset") started = false;
  }

  const name = created?.name ?? "Pantopong tournament";
  const format = created?.format === "single" ? "Single elimination" : "Double elimination";
  const n = started ? players : joined.size;

  const title = started
    ? `${name} — underway`
    : `Sign up for ${name}`;
  const desc = started
    ? `${format} · ${n} player${n === 1 ? "" : "s"} · tap to follow the bracket`
    : n === 0
    ? `${format} · nobody has signed up yet · tap to add your name`
    : `${format} · ${n} player${n === 1 ? "" : "s"} in · tap to add your name`;

  const target = `${APP}?api=${encodeURIComponent(origin)}#t=${tid}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pantopong 🏓">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin)}/t/${esc(tid)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<style>
  body{background:#0e1014;color:#eef1f6;font:15px/1.5 system-ui,sans-serif;
       display:grid;place-items:center;height:100vh;margin:0;text-align:center}
  a{color:#f0b429}
</style>
</head>
<body>
<div>
  <p style="font-size:40px;margin:0">🏓</p>
  <p><strong>${esc(name)}</strong></p>
  <p><a href="${esc(target)}">Open the bracket</a></p>
</div>
<script>location.replace(${JSON.stringify(target)})</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

// Avatars arrive as an image data URL in a text/plain body, which keeps the
// request CORS-simple and avoids a preflight the default headers don't cover.
async function avatar(req: Request, pid: string): Promise<Response> {
  const key = `av/${pid}`;

  if (req.method === "GET") {
    const rec = await blob.getJSON(key) as { mime: string; b64: string } | undefined;
    if (!rec) return new Response("no avatar", { status: 404 });
    const bin = atob(rec.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, {
      headers: { "content-type": rec.mime, "cache-control": "public, max-age=60" },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  const body = await req.text();
  const m = body.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return Response.json({ error: "expected an image data url" }, { status: 400 });
  if (m[2].length > AV_MAX_B64) {
    return Response.json({ error: "image too large" }, { status: 413 });
  }

  await blob.setJSON(key, { mime: m[1], b64: m[2] });
  return Response.json({ ok: true });
}
