# Pantopong

Create a ping pong tournament, share the link, people add themselves, run the bracket.
That's the whole thing.

No accounts, no league tables, no records, no season. One tournament at a time.

```
index.html          markup
app.js              state reducer, bracket generator, views
style.css           styles (light + dark)
valtown/api.ts      persistence endpoint — paste into Val Town, not served by Pages
```

## Run it locally

```sh
python3 -m http.server 8899
open http://localhost:8899
```

`file://` will not work — the page needs http.

With no endpoint set, everything lives in `localStorage` in that one browser, so nobody
else can join. Fine for trying it; useless for a real tournament.

## Wire up sharing

1. [val.town](https://val.town) → new **HTTP val**.
2. Paste `valtown/api.ts`, save. You get a URL like `https://sethj-pantopong.web.val.run`.
3. ⚙ on the site → paste the URL.

The join link then carries the endpoint (`?api=…#t=…`), so anyone who opens it is wired up
automatically — no setup for the other players.

The endpoint is **append-only**: one op per request, pushed onto a log. No update path, no
delete path.

## Deploy to GitHub Pages

```sh
git init && git add -A && git commit -m "Pantopong"
gh repo create sethj-pantomath/pantopong --public --source=. --push
gh api -X POST repos/sethj-pantomath/pantopong/pages -f build_type=legacy \
  -f 'source[branch]=main' -f 'source[path]=/'
```

Live at `https://sethj-pantomath.github.io/pantopong/`.

## How it works

**Create** — name it, pick single or double elimination.

**Share** — copy the join link into the channel.

**Join** — anyone who opens the link types their name and they're in. Identity is a random
id in `localStorage`, so "you" is whoever this browser joined as. You can remove yourself;
the creator can remove anyone. Nobody signs in.

**Start** — random seeds or join order. Anyone can start it. Field sizes that aren't a
power of two give byes to the top seeds.

**Play** — tap a name to advance them, tap the winner again to undo. Champion gets a
banner. Back to lobby clears results and lets you reseed.

No scores — just who won. Add them later if the league misses them.

## Bracket

Standard elimination. Double: winners bracket of *n*−1 slots, losers bracket of *n*−2, plus
the grand final. Byes only collapse when the opposing feeder can never produce a player —
an undecided feeder stays TBD.

Verified for every field size from 2 to 10 in both formats: double resolves in exactly
2*n*−2 matches (everyone but the champion loses twice), single in *n*−1.

No bracket-reset match in double elim — if the losers-bracket player wins the grand final,
they win outright.

## State

Every action is one appended op; state is a reduction over the log.

| op | effect |
|---|---|
| `create` | new tournament |
| `join` / `leave` | add or remove a player in the lobby |
| `start` | lock the seed order and bracket size |
| `reset` | back to lobby, clear results |
| `result` | set or clear a slot winner |

Names are remembered per tournament even after someone leaves, so a bracket never loses a
label.
