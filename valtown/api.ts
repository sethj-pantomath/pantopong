import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";

const ALLOWED = new Set(["create", "join", "leave", "start", "reset", "result"]);
const MAX_OPS = 20000;

await sqlite.execute(`CREATE TABLE IF NOT EXISTS ops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  rx TEXT NOT NULL
)`);

// Val Town adds permissive CORS by default; setting any header here would
// disable all of them, so this deliberately touches none.
export default async function (req: Request): Promise<Response> {
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
