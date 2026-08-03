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

## Sharing

The endpoint is already deployed — the val `jethsones/pantopong` serves `valtown/api.ts`.
Set it once via ⚙ on the site, or just open a link carrying `?api=<endpoint>` and it saves
itself.

The join link then carries the endpoint (`?api=…#t=…`), so anyone who opens it is wired up
automatically — no setup for the other players.

Writes are **append-only**: one op per request, one `INSERT`. No update path, no delete
path, so the worst a bad actor can do is add an op. The insert is conditional on a row cap
in a single statement, which makes it atomic — concurrent result clicks during a tournament
can't lose a write the way a read-modify-write cycle would. Verified with 12 simultaneous
POSTs: all 12 landed.

Corrections are made by appending, or from the val's SQLite console for real cleanup.

To redeploy after editing `valtown/api.ts`, push the file contents to the val's `api.ts`.

## Deploy to GitHub Pages

```sh
git init && git add -A && git commit -m "Pantopong"
gh repo create sethj-pantomath/pantopong --public --source=. --push
gh api -X POST repos/sethj-pantomath/pantopong/pages -f build_type=legacy \
  -f 'source[branch]=main' -f 'source[path]=/'
```

Live at `https://sethj-pantomath.github.io/pantopong/`.

## How it works

**Create** — name it, pick single or double elimination. The format can be toggled from the
lobby right up until kickoff, with the match count for each shown so a big field is an
informed choice (14 players is 26 matches double, 13 single).

**Share** — copy the join link into the channel. It points at the val's `/t/<tid>` route,
not the app, so it unfurls in Slack with the tournament name and a live player count:

> **Sign up for Vikram Send-Off Invitational**
> Double elimination · 4 players in · tap to add your name

That indirection is necessary, not decorative. The app keeps the tournament id in the URL
*fragment*, which browsers never transmit, so a static page has no way to know which
tournament a link refers to. The val does, and it can render Open Graph tags per
tournament. Real browsers are redirected onward to the app in JavaScript — deliberately
not a meta-refresh, which some crawlers follow before reading the tags.

The preview carries a generated 1200×630 card (`og.ts`, via satori + resvg-wasm) showing the
tournament name, format, who's signed up, and the count. The logo mark is drawn as a shape
rather than the 🏓 emoji — Inter has no emoji glyph, so the character rendered as tofu.

Slack caches unfurls, so a player count can read low if you paste the same link twice.

## On a phone

Built to feel like an app rather than a page in a browser:

- **Installable.** Web manifest plus an apple-touch-icon, so Add to Home Screen gives a
  standalone window with no browser chrome and a matching status bar.
- **Native share sheet.** Where `navigator.share` exists the button becomes *Share* and
  opens the OS sheet, which is how the link actually reaches Slack from a phone. A
  cancelled share stays silent instead of looking like a failure.
- **No zoom-on-focus.** Inputs are 16px minimum; anything smaller makes iOS zoom the whole
  page when a field is focused, which is the single most page-like tell there is.
- **Tap targets** are 44px minimum, with fatter colour and emoji swatches on small screens,
  and bracket rows padded out since they're the main thing you tap.
- **No grey tap flash**, no rubber-band scroll chaining, and no accidental text selection on
  controls — while names, headings, and the link field stay selectable.
- **Safe-area insets** so the header clears a notch and nothing sits under the home bar.
- **Bracket scroll snaps** by round, and its scrollbar is hidden.
- Actions go full-width and stack in one column under 560px.

**Join** — anyone who opens the link types their name and they're in. Identity is a random
id in `localStorage`, so "you" is whoever this browser joined as. You can remove yourself;
the creator can remove anyone. Nobody signs in.

**Avatars** — three options at join time, with a live preview:

- *Initials* on a colour you pick. The default, with a colour derived from your name so it
  looks deliberate even if you touch nothing.
- *Emoji* from a 32-option grid. Costs nothing — it rides along in the `join` op.
- *Photo*, centre-cropped square and resized to 160px in the browser before upload, which
  turns a phone photo into roughly 10KB. Stored as a blob on the val and served from
  `/avatar/<pid>`. Needs the shared endpoint; a failed upload falls back to initials rather
  than blocking the join.

Avatars appear in the lobby, in every bracket slot, and on the champion banner.

**Seed** — the lobby lists players in seed order with nudge controls. Order is a shared op,
so everyone sees the same seeding. Seed 1 plays the lowest seed, and the top seeds take the
byes when the field isn't a power of two.

**Seed password** (optional) — anyone can set one from the lobby. After that, reordering
prompts for it, and the **endpoint** refuses a `seed` or `lock` op without it. That gating
is deliberately server-side: identity here is a self-asserted id in `localStorage`, so
hiding buttons would stop nobody. Joining, starting, and clicking results stay open.

The password is hashed with PBKDF2 (100k iterations, salted per tournament) because the op
log is world-readable — a bare digest of a memorable phrase would be cheap to guess. The
password itself is stripped before the op is stored, and remembered per browser so nudging
isn't a nag. A rejected attempt forgets it so the next try re-prompts.

**Start** — seeded order or shuffle. Anyone can start it.

**Play** — tap a name to advance them, tap the winner again to undo. Champion gets a
banner. Back to lobby clears results and lets you reseed.

No scores — just who won. Add them later if the league misses them.

The bracket page carries the house rules: best 2 of 3 to 11, serve switches every 2, unlimited
lets, and at 10-10 serve switches every point until someone wins by 2.

## Bracket pool

Anyone can fill out a predicted bracket from the bracket page, players and
non-players alike, and every entry is scored live on a leaderboard underneath.

Points double each round so each round is worth about the same overall: 1 for a
round-1 pick, 2, 4, then 8 for the final. A 15-player field is 14 matches and 31
points.

**An entry only earns matches decided after it was submitted.** That is what makes
the pool usable mid-tournament: entering late is allowed but costs you every match
already played, so there is nothing to gain by waiting and no lock step anyone has
to remember. Picks are public, because the scoring rule already removes any
advantage from copying — an earlier attempt sealed them until each match resolved,
which bought nothing and made max-reachable, busted and champion-pick
uncomputable for anyone but yourself.

Any row on the leaderboard opens that person's bracket, marked against what has
actually happened: a green tick for a pick that came in, a red cross for one that
did not, amber for still to come, and greyed out for a match that was already
decided when the bracket was submitted and so counts for nobody.

**Max** is the most an entry can still reach. It drops when a player they picked is
eliminated, so a bracket can be mathematically finished while still sitting near
the top of the table.

**An entry freezes once the first match is decided.** Scoring credits an entry only for
matches decided after it was submitted, and a re-submission carries a new timestamp, so
editing a live entry would silently forfeit every point it had already earned. The
endpoint refuses the write rather than relying on the button being hidden. A brand new
entry is still accepted at any time: a latecomer has nothing to lose, and giving up the
matches already played is the intended cost.

Draft picks live in `localStorage` until submitted, so clearing browser data before
submitting loses the draft.

The app polls every 30s while the tab is visible, and immediately on refocus, so a
leaderboard people are watching actually moves.

## Bracket

Standard elimination. Double: winners bracket of *n*−1 slots, losers bracket of *n*−2, the
grand final, and a conditional bracket reset. Byes only collapse when the opposing feeder
can never produce a player — an undecided feeder stays TBD.

**Bracket reset.** The winners-bracket finalist arrives at the grand final unbeaten. If
they lose it, they have one loss, not two, so the reset match is played and appears
automatically. If they win the grand final, it's over and the reset never shows up. Undoing
the grand final result hides it again.

So a double-elimination tournament runs 2*n*−2 matches when the winners-bracket player
takes the final, and 2*n*−1 when the reset is needed. Single elimination is *n*−1.

Verified for field sizes 2–10: both grand-final outcomes, both reset outcomes, correct
champion in each, and the reset slot appearing and disappearing as the grand final is
decided and undone.

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
