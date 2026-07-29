'use strict';

const LS = { api: 'pantopong.api', pid: 'pantopong.pid', name: 'pantopong.name', ops: 'pantopong.ops.v2' };
const VOID = ' void';
const PEND = ' pend';

const PALETTE = ['#e0564f', '#e08a2e', '#d8b431', '#5aa85a', '#3f9bb5', '#4d78d0', '#8a63c8', '#c05a94'];
const EMOJI = [
  '🏓', '🔥', '💀', '🐐', '🦅', '🐍', '🦈', '🐺',
  '🍬', '🧊', '⚡', '🌪', '🎯', '🚀', '👑', '🥊',
  '🤖', '👽', '🧙', '🥷', '🤠', '🦖', '🐸', '🦆',
  '☕', '🍺', '🌮', '🧀', '🥔', '🍌', '🧠', '😤'
];

let OPS = [];
let TS = {};
let API = '';
let PID = '';
let MYNAME = '';
let NOTE = '';
let AVK = 'color';
let AVV = '';
let AVPHOTO = '';

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('hashchange', render);

async function init() {
  const q = new URLSearchParams(location.search);
  if (q.get('api')) localStorage.setItem(LS.api, normApi(q.get('api')));
  API = normApi(localStorage.getItem(LS.api) || '');

  PID = localStorage.getItem(LS.pid) || '';
  if (!PID) {
    PID = 'p' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(LS.pid, PID);
  }
  MYNAME = localStorage.getItem(LS.name) || '';

  OPS = await loadOps();
  wire();
  render();
}

// ---------- persistence ----------

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS.ops)) || []; } catch (e) { return []; }
}

function writeLocal(ops) {
  try { localStorage.setItem(LS.ops, JSON.stringify(ops)); } catch (e) { /* quota */ }
}

async function loadOps() {
  if (!API) return readLocal();
  try {
    const r = await fetch(API, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const ops = Array.isArray(d) ? d : (d.ops || []);
    writeLocal(ops);
    NOTE = '';
    return ops;
  } catch (e) {
    NOTE = 'Offline — showing the last synced copy.';
    return readLocal();
  }
}

async function pushOp(op) {
  op.at = new Date().toISOString();
  OPS.push(op);
  writeLocal(OPS);
  render();
  if (!API) return;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(op)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    OPS = await loadOps();
  } catch (e) {
    NOTE = 'Saved here but not shared — the endpoint rejected it.';
  }
  render();
}

async function refresh() {
  OPS = await loadOps();
  render();
}

// ---------- state ----------

function reduceOps(ops) {
  const ts = {};
  ops.forEach(function (op) {
    if (op.t === 'create') {
      if (!ts[op.tid]) {
        ts[op.tid] = {
          tid: op.tid, name: op.name, format: op.format === 'single' ? 'single' : 'double',
          host: op.pid, at: op.at, players: [], names: {}, avatars: {},
          order: [], seeds: null, size: 0, results: {}
        };
      }
      return;
    }
    const T = ts[op.tid];
    if (!T) return;
    switch (op.t) {
      case 'join':
        T.names[op.pid] = op.name;
        T.avatars[op.pid] = op.av || { k: 'color', v: colorFor(op.name) };
        if (!T.players.some(function (p) { return p.pid === op.pid; })) {
          T.players.push({ pid: op.pid, name: op.name });
        } else {
          T.players.forEach(function (p) { if (p.pid === op.pid) p.name = op.name; });
        }
        break;
      case 'leave':
        T.players = T.players.filter(function (p) { return p.pid !== op.pid; });
        break;
      case 'seed':
        T.order = (op.order || []).slice();
        break;
      case 'start':
        T.seeds = op.seeds.slice();
        T.size = op.size;
        T.results = {};
        break;
      case 'reset':
        T.seeds = null;
        T.size = 0;
        T.results = {};
        break;
      case 'result':
        if (op.winner) T.results[op.slot] = op.winner;
        else delete T.results[op.slot];
        break;
    }
  });
  return ts;
}

function currentTid() {
  const h = location.hash.replace(/^#/, '');
  return h.indexOf('t=') === 0 ? h.slice(2) : '';
}

function nameOf(T, pid) { return T.names[pid] || 'Unknown'; }
function joined(T) { return T.players.some(function (p) { return p.pid === PID; }); }

// the stored order is advisory: anyone who joined or left since it was set is
// reconciled here, so a stale order can never drop or duplicate a player
function seedOrder(T) {
  const live = T.players.map(function (p) { return p.pid; });
  const ordered = T.order.filter(function (pid) { return live.indexOf(pid) >= 0; });
  live.forEach(function (pid) { if (ordered.indexOf(pid) < 0) ordered.push(pid); });
  return ordered;
}

function moveSeed(T, pid, dir) {
  const order = seedOrder(T);
  const i = order.indexOf(pid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  order[i] = order[j];
  order[j] = pid;
  pushOp({ t: 'seed', tid: T.tid, order: order });
}

// ---------- avatars ----------

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase();
}

function colorFor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return PALETTE[h % PALETTE.length];
}

function avatarMarkup(av, name, pid, size) {
  const cls = 'av av-' + size;
  const a = av || { k: 'color' };
  // a local draft wins over the stored URL: during the join flow the upload
  // has not happened yet, so the endpoint would 404 and look like a failure
  if (a.k === 'photo' && a.d) {
    return '<img class="' + cls + '" src="' + esc(a.d) + '" alt="">';
  }
  if (a.k === 'photo' && API) {
    return '<img class="' + cls + '" src="' + esc(API + '/avatar/' + pid) + '" alt="" ' +
      'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),' +
      '{className:\'' + cls + '\',textContent:\'' + esc(initialsOf(name)) + '\',style:\'background:' +
      esc(colorFor(name)) + '\'}))">';
  }
  if (a.k === 'emoji' && a.v) {
    return '<span class="' + cls + ' av-em">' + esc(a.v) + '</span>';
  }
  return '<span class="' + cls + '" style="background:' + esc(a.v || colorFor(name)) + '">' +
    esc(initialsOf(name)) + '</span>';
}

function avatarOf(T, pid, size) {
  return avatarMarkup(T.avatars[pid], nameOf(T, pid), pid, size);
}

function myAvatarDraft() {
  if (AVK === 'photo' && AVPHOTO) return { k: 'photo', d: AVPHOTO };
  if (AVK === 'emoji') return { k: 'emoji', v: AVV || EMOJI[0] };
  return { k: 'color', v: AVV || colorFor(MYNAME) };
}

function avatarChooser() {
  const tab = function (k, label) {
    return '<button type="button" data-avtab="' + k + '"' + (AVK === k ? ' class="on"' : '') + '>' +
      label + '</button>';
  };

  let panel = '';
  if (AVK === 'color') {
    panel = '<div class="swatches">' + PALETTE.map(function (c) {
      const on = (AVV || colorFor(MYNAME)) === c;
      return '<button type="button" data-avcolor="' + c + '" style="background:' + c + '"' +
        (on ? ' class="on"' : '') + ' aria-label="colour"></button>';
    }).join('') + '</div>';
  } else if (AVK === 'emoji') {
    panel = '<div class="emojis">' + EMOJI.map(function (e) {
      return '<button type="button" data-avemoji="' + e + '"' +
        ((AVV || EMOJI[0]) === e ? ' class="on"' : '') + '>' + e + '</button>';
    }).join('') + '</div>';
  } else if (!API) {
    panel = '<p class="hint">Photos need the shared endpoint — set it in ⚙ first. ' +
      'Initials and emoji work offline.</p>';
  } else {
    panel = '<div class="photorow">' +
      '<input type="file" id="av-file" accept="image/*">' +
      (AVPHOTO ? '<span class="ok">ready</span>' : '<span class="hint">square crop, resized to 160px</span>') +
      '</div>';
  }

  return '<div class="avtabs">' + tab('color', 'Initials') + tab('emoji', 'Emoji') +
    tab('photo', 'Photo') + '</div><div class="avpanel">' + panel + '</div>';
}

// ---------- bracket ----------

function real(x) { return x && x !== VOID && x !== PEND; }

function pairingOrder(size) {
  let o = [1];
  while (o.length < size) {
    const n = o.length * 2, next = [];
    o.forEach(function (s) { next.push(s, n + 1 - s); });
    o = next;
  }
  return o;
}

function bracketSize(n, format) {
  const pow = Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
  return format === 'single' ? Math.max(2, pow) : Math.max(4, pow);
}

function buildSlots(size, format) {
  const slots = [];
  const wbRounds = Math.round(Math.log2(size));
  const order = pairingOrder(size);

  for (let r = 1; r <= wbRounds; r++) {
    const n = size / Math.pow(2, r);
    for (let i = 0; i < n; i++) {
      const s = { id: 'W' + r + '-' + i, br: 'W', r: r, i: i };
      if (r === 1) {
        s.a = { seed: order[i * 2] };
        s.b = { seed: order[i * 2 + 1] };
      } else {
        s.a = { from: 'W' + (r - 1) + '-' + (i * 2) };
        s.b = { from: 'W' + (r - 1) + '-' + (i * 2 + 1) };
      }
      slots.push(s);
    }
  }

  if (format === 'single') {
    return { slots: slots, wbRounds: wbRounds, lbRounds: 0, finalId: 'W' + wbRounds + '-0' };
  }

  let lr = 1;
  for (let i = 0; i < size / 4; i++) {
    slots.push({
      id: 'L1-' + i, br: 'L', r: 1, i: i,
      a: { lose: 'W1-' + (i * 2) }, b: { lose: 'W1-' + (i * 2 + 1) }
    });
  }

  for (let wbR = 2; wbR <= wbRounds; wbR++) {
    const n = size / Math.pow(2, wbR);
    lr++;
    for (let i = 0; i < n; i++) {
      slots.push({
        id: 'L' + lr + '-' + i, br: 'L', r: lr, i: i,
        a: { from: 'L' + (lr - 1) + '-' + i }, b: { lose: 'W' + wbR + '-' + i }
      });
    }
    if (n > 1) {
      lr++;
      for (let i = 0; i < n / 2; i++) {
        slots.push({
          id: 'L' + lr + '-' + i, br: 'L', r: lr, i: i,
          a: { from: 'L' + (lr - 1) + '-' + (i * 2) }, b: { from: 'L' + (lr - 1) + '-' + (i * 2 + 1) }
        });
      }
    }
  }

  slots.push({
    id: 'GF', br: 'F', r: 1, i: 0,
    a: { from: 'W' + wbRounds + '-0' }, b: { from: 'L' + lr + '-0' }
  });

  // only played when the losers-bracket player wins the grand final —
  // they arrive with one loss, so the winners-bracket player is owed a second
  slots.push({ id: 'GF2', br: 'F', r: 2, i: 0, reset: true });

  return { slots: slots, wbRounds: wbRounds, lbRounds: lr, finalId: 'GF' };
}

function resolveBracket(T) {
  const built = buildSlots(T.size, T.format);
  const seeds = T.seeds;
  const byId = {};
  const won = {}, lost = {};
  built.slots.forEach(function (s) { byId[s.id] = s; });

  // a missing entrant is a bye only when its feeder can never produce one;
  // an undecided feeder is PEND and must not advance the other side
  function ent(ref) {
    if (!ref) return VOID;
    if (ref.seed != null) return seeds[ref.seed - 1] || VOID;
    if (ref.from) {
      if (!byId[ref.from]) return VOID;
      const v = won[ref.from];
      return v === VOID ? VOID : real(v) ? v : PEND;
    }
    if (ref.lose) {
      if (!byId[ref.lose]) return VOID;
      const v = lost[ref.lose];
      return v === VOID ? VOID : real(v) ? v : PEND;
    }
    return VOID;
  }

  built.slots.forEach(function (s) {
    s.bye = false;
    s.dead = false;
    s.ready = false;
    s.hidden = false;

    if (s.reset) {
      const gf = byId.GF;
      const live = !!(gf.won && gf.pb && gf.won === gf.pb);
      s.hidden = !live;
      if (!live) {
        s.pa = null; s.pb = null; s.won = null;
        won[s.id] = VOID; lost[s.id] = VOID;
        return;
      }
      s.pa = gf.pa;
      s.pb = gf.pb;
      s.seedA = seeds.indexOf(s.pa) + 1;
      s.seedB = seeds.indexOf(s.pb) + 1;
      s.ready = true;
      const rw = T.results[s.id];
      if (rw === s.pa || rw === s.pb) {
        won[s.id] = rw;
        lost[s.id] = rw === s.pa ? s.pb : s.pa;
      } else {
        won[s.id] = PEND; lost[s.id] = PEND;
      }
      s.won = real(won[s.id]) ? won[s.id] : null;
      return;
    }

    const a = ent(s.a), b = ent(s.b);
    s.pa = real(a) ? a : null;
    s.pb = real(b) ? b : null;
    s.seedA = s.pa ? seeds.indexOf(s.pa) + 1 : 0;
    s.seedB = s.pb ? seeds.indexOf(s.pb) + 1 : 0;

    if (a === VOID && b === VOID) {
      won[s.id] = VOID; lost[s.id] = VOID; s.dead = true;
    } else if (a === PEND || b === PEND) {
      won[s.id] = PEND; lost[s.id] = PEND;
    } else if (real(a) && b === VOID) {
      won[s.id] = a; lost[s.id] = VOID; s.bye = true;
    } else if (a === VOID && real(b)) {
      won[s.id] = b; lost[s.id] = VOID; s.bye = true;
    } else {
      s.ready = true;
      const w = T.results[s.id];
      if (w === a || w === b) {
        won[s.id] = w;
        lost[s.id] = w === a ? b : a;
      } else {
        won[s.id] = PEND; lost[s.id] = PEND;
      }
    }
    s.won = real(won[s.id]) ? won[s.id] : null;
  });

  const gf2 = byId.GF2;
  built.champion = gf2 && !gf2.hidden
    ? gf2.won
    : (real(won[built.finalId]) ? won[built.finalId] : null);
  built.remaining = built.slots.filter(function (s) { return s.ready && !s.won; }).length;
  return built;
}

function roundLabel(br, r, wbRounds, lbRounds, format) {
  if (br === 'F') return r === 2 ? 'Bracket Reset' : 'Grand Final';
  if (br === 'W') {
    if (r === wbRounds) return format === 'single' ? 'Final' : 'Winners Final';
    if (r === wbRounds - 1) return format === 'single' ? 'Semifinals' : 'Winners Semis';
    return (format === 'single' ? 'Round ' : 'Winners R') + r;
  }
  if (r === lbRounds) return 'Losers Final';
  return 'Losers R' + r;
}

// ---------- render ----------

function render() {
  TS = reduceOps(OPS);
  const note = document.getElementById('note');
  note.hidden = !NOTE;
  note.textContent = NOTE;
  document.getElementById('api-input').value = API;

  const tid = currentTid();
  const T = TS[tid];
  const view = document.getElementById('view');

  if (!tid || !T) view.innerHTML = viewHome(tid && !T);
  else if (!T.seeds) view.innerHTML = viewLobby(T);
  else view.innerHTML = viewBracket(T);
}

function viewHome(missing) {
  const list = Object.keys(TS).map(function (k) { return TS[k]; })
    .sort(function (a, b) { return a.at < b.at ? 1 : -1; });

  return (missing ? '<p class="note">That tournament is not in this browser yet. ' +
    (API ? 'Try refreshing.' : 'Add the Val Town endpoint in ⚙ to load shared tournaments.') + '</p>' : '') +
    '<section class="panel hero">' +
    '<h1>New tournament</h1>' +
    '<form id="new-form">' +
    '<label class="field"><span>Name it</span>' +
    '<input id="t-name" placeholder="Vikram Send-Off Invitational" maxlength="60" required></label>' +
    '<label class="field"><span>Format</span><select id="t-format">' +
    '<option value="double">Double elimination</option>' +
    '<option value="single">Single elimination</option>' +
    '</select></label>' +
    '<button class="primary big" type="submit">Create</button>' +
    '</form>' +
    '<p class="hint">You get a link. Anyone who opens it types their name and they are in.</p>' +
    '</section>' +
    (list.length ? '<section class="panel"><h2>Recent</h2><ul class="tlist">' +
      list.slice(0, 12).map(function (T) {
        const b = T.seeds ? resolveBracket(T) : null;
        const state = !T.seeds ? T.players.length + ' joined · lobby' :
          b.champion ? 'won by ' + esc(nameOf(T, b.champion)) :
            b.remaining + ' match' + (b.remaining === 1 ? '' : 'es') + ' to play';
        return '<li><a href="#t=' + esc(T.tid) + '"><strong>' + esc(T.name) + '</strong>' +
          '<span>' + state + '</span></a></li>';
      }).join('') + '</ul></section>' : '');
}

function viewLobby(T) {
  const mine = joined(T);
  const isHost = T.host === PID;
  const n = T.players.length;
  const size = bracketSize(n, T.format);

  return '<section class="panel">' +
    '<h1>' + esc(T.name) + '</h1>' +
    '<p class="sub">' + (T.format === 'single' ? 'Single' : 'Double') + ' elimination · lobby</p>' +
    '<div class="linkbox">' +
    '<input id="join-link" readonly value="' + esc(joinLink(T.tid)) + '">' +
    '<button class="primary" id="copy-link">' +
    (canShare() ? 'Share' : 'Copy join link') + '</button>' +
    '</div>' +
    '<p class="hint">Drop that in the channel. Everyone who opens it can add themselves.</p>' +
    '</section>' +

    '<section class="panel">' +
    '<h2>' + n + ' in' + (n ? '' : ' — nobody yet') + '</h2>' +
    (n ? '<ol class="seedlist">' + seedOrder(T).map(function (pid, i) {
      const byes = size - n;
      return '<li' + (pid === PID ? ' class="me"' : '') + '>' +
        '<span class="sn">' + (i + 1) + '</span>' +
        avatarOf(T, pid, 'sm') +
        '<span class="pn">' + esc(nameOf(T, pid)) + '</span>' +
        (i < byes ? '<em class="bye">bye</em>' : '') +
        (pid === T.host ? '<em>host</em>' : '') +
        '<span class="nudge">' +
        '<button data-up="' + esc(pid) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">▲</button>' +
        '<button data-down="' + esc(pid) + '"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="Move down">▼</button>' +
        '</span>' +
        (pid === PID || isHost
          ? '<button class="x" data-drop="' + esc(pid) + '" title="Remove">×</button>' : '') +
        '</li>';
    }).join('') + '</ol>' +
      '<p class="hint">Seed 1 plays the lowest seed. Nudge people up or down to set the ' +
      'bracket — everyone sees the same order.</p>' : '') +

    (mine ? '' :
      '<form id="join-form" class="joinbox">' +
      '<div class="joinrow">' +
      '<span class="avprev">' + avatarMarkup(myAvatarDraft(), MYNAME, PID, 'lg') + '</span>' +
      '<input id="join-name" placeholder="Your name" maxlength="24" value="' + esc(MYNAME) + '" required>' +
      '<button class="primary" type="submit">Join</button>' +
      '</div>' + avatarChooser() +
      '</form>') +
    '</section>' +

    '<section class="panel">' +
    (n < 2
      ? '<p class="hint">Two players minimum to start.</p>'
      : '<div class="row">' +
      '<button class="primary big" data-start="order">Start · seeded order</button>' +
      '<button data-start="random">Shuffle &amp; start</button>' +
      '</div><p class="hint">' + n + ' player' + (n === 1 ? '' : 's') + ' in a ' + size +
      '-slot bracket' + (size > n ? ' — the top ' + (size - n) + ' seed' + (size - n === 1 ? '' : 's') + ' get a bye' : '') +
      '. Anyone can start it.</p>')
    + '</section>';
}

function viewBracket(T) {
  const b = resolveBracket(T);
  const groups = {};
  b.slots.forEach(function (s) {
    if (s.hidden) return;
    const key = s.br + s.r;
    (groups[key] = groups[key] || { br: s.br, r: s.r, slots: [] }).slots.push(s);
  });

  let html = '<section class="panel head">' +
    '<div><h1>' + esc(T.name) + '</h1>' +
    '<p class="sub">' + (T.format === 'single' ? 'Single' : 'Double') + ' elimination · ' +
    T.seeds.length + ' players</p></div>' +
    '<button class="ghost" id="copy-link">' + (canShare() ? 'Share' : 'Copy link') + '</button>' +
    '</section>';

  if (b.champion) {
    html += '<div class="champ"><span>🏆</span>' + avatarOf(T, b.champion, 'xl') +
      '<div><em>Champion</em><strong>' + esc(nameOf(T, b.champion)) + '</strong></div></div>';
  }

  ['W', 'L', 'F'].forEach(function (br) {
    const rounds = Object.keys(groups).filter(function (k) { return groups[k].br === br; })
      .map(function (k) { return groups[k]; })
      .sort(function (x, y) { return x.r - y.r; });
    if (!rounds.length) return;
    const title = br === 'W' ? (T.format === 'single' ? '' : 'Winners') :
      br === 'L' ? 'Losers' : '';
    html += '<section class="panel">' + (title ? '<h2>' + title + '</h2>' : '') +
      '<div class="bscroll"><div class="rounds">' +
      rounds.map(function (g) {
        return '<div class="round"><h3>' +
          roundLabel(g.br, g.r, b.wbRounds, b.lbRounds, T.format) + '</h3><div class="slots">' +
          g.slots.map(function (s) { return slotHtml(T, s); }).join('') + '</div></div>';
      }).join('') + '</div></div></section>';
  });

  html += '<section class="panel"><p class="hint">Tap a name to advance them. ' +
    'Tap the winner again to undo.</p><div class="row">' +
    '<button class="ghost" data-reset="1">Back to lobby</button></div></section>';
  return html;
}

function slotHtml(T, s) {
  const cls = 'slot' + (s.id === 'GF' ? ' gf' : '') +
    (s.won ? ' done' : s.ready ? ' ready' : '') + (s.dead ? ' dead' : '');

  function side(p, seed) {
    if (!p) {
      return '<div class="side tbd"><i></i><span>' +
        (s.dead ? '—' : s.bye ? 'Bye' : 'TBD') + '</span></div>';
    }
    const isWin = s.won === p;
    return '<button class="side' + (s.ready ? ' pick' : '') + (isWin ? ' won' : '') +
      (s.won && !isWin ? ' out' : '') + '"' +
      (s.ready ? ' data-slot="' + esc(s.id) + '" data-pick="' + esc(p) + '"' : ' disabled') + '>' +
      '<i>' + (seed > 0 ? seed : '') + '</i>' +
      avatarOf(T, p, 'sm') +
      '<span>' + esc(nameOf(T, p)) + '</span>' +
      (isWin ? '<b>✓</b>' : '') + '</button>';
  }

  return '<div class="' + cls + '">' + side(s.pa, s.seedA) + side(s.pb, s.seedB) + '</div>';
}

// ---------- events ----------

function wire() {
  document.getElementById('btn-settings').addEventListener('click', function () {
    const p = document.getElementById('settings');
    p.hidden = !p.hidden;
  });
  document.getElementById('settings-close').addEventListener('click', function () {
    document.getElementById('settings').hidden = true;
  });
  document.getElementById('api-save').addEventListener('click', async function () {
    API = normApi(document.getElementById('api-input').value);
    localStorage.setItem(LS.api, API);
    document.getElementById('settings').hidden = true;
    await refresh();
  });

  document.body.addEventListener('submit', function (e) {
    if (e.target.id === 'new-form') {
      e.preventDefault();
      createTournament();
    } else if (e.target.id === 'join-form') {
      e.preventDefault();
      joinTournament();
    }
  });

  document.body.addEventListener('input', function (e) {
    if (e.target.id === 'join-name') {
      MYNAME = e.target.value;
      const prev = document.querySelector('.avprev');
      if (prev) prev.innerHTML = avatarMarkup(myAvatarDraft(), MYNAME, PID, 'lg');
    }
  });

  document.body.addEventListener('change', function (e) {
    if (e.target.id === 'av-file') pickPhoto(e.target.files[0]);
  });

  document.body.addEventListener('click', function (e) {
    const nudge = e.target.closest('[data-up],[data-down]');
    if (nudge) {
      const T2 = TS[currentTid()];
      if (T2) moveSeed(T2, nudge.dataset.up || nudge.dataset.down, nudge.dataset.up ? -1 : 1);
      return;
    }

    const av = e.target.closest('[data-avtab],[data-avcolor],[data-avemoji]');
    if (av) {
      const d = av.dataset;
      if (d.avtab) { AVK = d.avtab; if (AVK !== 'photo') AVV = ''; }
      else if (d.avcolor) { AVK = 'color'; AVV = d.avcolor; }
      else if (d.avemoji) { AVK = 'emoji'; AVV = d.avemoji; }
      render();
      return;
    }

    const t = e.target.closest('[data-pick],[data-start],[data-drop],[data-reset],#copy-link');
    if (!t) return;
    const T = TS[currentTid()];
    const d = t.dataset;

    if (t.id === 'copy-link') {
      shareOrCopy(T, joinLink(currentTid()));
    } else if (d.pick && T) {
      const cur = T.results[d.slot];
      pushOp({ t: 'result', tid: T.tid, slot: d.slot, winner: cur === d.pick ? null : d.pick, pid: PID });
    } else if (d.start && T) {
      startTournament(T, d.start === 'random');
    } else if (d.drop && T) {
      pushOp({ t: 'leave', tid: T.tid, pid: d.drop });
    } else if (d.reset && T) {
      if (confirm('Send everyone back to the lobby? Bracket results are cleared.')) {
        pushOp({ t: 'reset', tid: T.tid, pid: PID });
      }
    }
  });
}

function createTournament() {
  const name = document.getElementById('t-name').value.trim();
  const format = document.getElementById('t-format').value;
  if (!name) return;
  const tid = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  pushOp({ t: 'create', tid: tid, name: name, format: format, pid: PID });
  location.hash = 't=' + tid;
}

async function joinTournament() {
  const T = TS[currentTid()];
  if (!T) return;
  const name = document.getElementById('join-name').value.trim();
  if (!name) return;
  MYNAME = name;
  localStorage.setItem(LS.name, name);

  let av = myAvatarDraft();
  if (av.k === 'photo' && av.d) {
    const stored = await uploadPhoto(av.d);
    // a failed upload must not block joining — fall back to initials
    av = stored ? { k: 'photo' } : { k: 'color', v: colorFor(name) };
  }

  pushOp({ t: 'join', tid: T.tid, pid: PID, name: name, av: av });
}

// square centre-crop down to 160px so a phone photo becomes ~10KB.
// Validation is by decoding, not by file.type — some pickers report an
// empty type for perfectly good images.
function pickPhoto(file) {
  if (!file) return;
  const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

  decodeImage(file).then(function (src) {
    const side = Math.min(src.width, src.height);
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    c.getContext('2d').drawImage(
      src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, 160, 160
    );
    AVPHOTO = c.toDataURL('image/jpeg', 0.82);
    AVK = 'photo';
    NOTE = '';
    if (src.close) src.close();
    render();
  }).catch(function () {
    warn(heic
      ? 'This browser can’t read HEIC photos. Take a screenshot of it and upload that, ' +
        'or switch your iPhone to Settings → Camera → Formats → Most Compatible.'
      : 'Could not read that image — try a JPEG or PNG.');
  });
}

// createImageBitmap reads formats <img> sometimes won't, and honours EXIF
// orientation so sideways phone photos don't stay sideways
function decodeImage(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function () { return decodeViaImg(file); });
  }
  return decodeViaImg(file);
}

function decodeViaImg(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('undecodable')); };
    img.src = url;
  });
}

async function uploadPhoto(dataUrl) {
  if (!API) return false;
  try {
    const r = await fetch(API + '/avatar/' + PID, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: dataUrl
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return true;
  } catch (e) {
    NOTE = 'Avatar upload failed, using initials instead. (' + e.message + ')';
    return false;
  }
}

function startTournament(T, shuffle) {
  const seeds = seedOrder(T);
  if (seeds.length < 2) return;
  if (shuffle) {
    for (let i = seeds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = seeds[i]; seeds[i] = seeds[j]; seeds[j] = tmp;
    }
  }
  pushOp({ t: 'start', tid: T.tid, seeds: seeds, size: bracketSize(seeds.length, T.format), pid: PID });
}

// ---------- helpers ----------

function warn(msg) {
  NOTE = msg;
  render();
}

function normApi(u) {
  return String(u || '').trim().replace(/\/+$/, '');
}

// the val's /t/ route carries Open Graph tags so the link unfurls in Slack,
// then bounces to the app; without an endpoint there is nothing to share
function joinLink(tid) {
  if (API) return API + '/t/' + tid;
  return location.origin + location.pathname + '#t=' + tid;
}

function canShare() {
  return typeof navigator !== 'undefined' && !!navigator.share;
}

// on a phone the OS share sheet is how the link actually reaches Slack;
// a cancelled share must stay silent rather than look like a failure
function shareOrCopy(T, url) {
  if (canShare()) {
    navigator.share({
      title: T ? T.name : 'Pantopong',
      text: T ? 'Sign up for ' + T.name : 'Pantopong tournament',
      url: url
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      copy(url);
    });
    return;
  }
  copy(url);
}

function copy(text) {
  if (!navigator.clipboard) {
    NOTE = text;
    return render();
  }
  navigator.clipboard.writeText(text).then(function () {
    NOTE = 'Link copied.';
    render();
  }, function () {
    NOTE = text;
    render();
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
