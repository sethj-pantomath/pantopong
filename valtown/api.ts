import { blob } from "https://esm.town/v/std/blob";

const KEY = "pantopong/ops";
const MAX_OPS = 20000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const ALLOWED = new Set([
  "create",
  "join",
  "leave",
  "start",
  "reset",
  "result",
]);

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const ops: any[] = (await blob.getJSON(KEY)) ?? [];

  if (req.method === "GET") {
    return Response.json({ ops }, { headers: CORS });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405, headers: CORS });
  }

  let op: any;
  try {
    op = JSON.parse(await req.text());
  } catch {
    return Response.json({ error: "bad json" }, { status: 400, headers: CORS });
  }

  if (!op || !ALLOWED.has(op.t)) {
    return Response.json({ error: "unknown op" }, { status: 400, headers: CORS });
  }
  if (ops.length >= MAX_OPS) {
    return Response.json({ error: "op log full" }, { status: 507, headers: CORS });
  }

  // the log is append-only: a bad actor can add a match, never erase a season
  op.rx = new Date().toISOString();
  ops.push(op);
  await blob.setJSON(KEY, ops);

  return Response.json({ ok: true, n: ops.length }, { headers: CORS });
}
