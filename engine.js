export const PLAYERS = ['你', '東家', '北家', '西家'];
const civilians = [
  ['天', 6, 6], ['地', 1, 1], ['人', 4, 4], ['和', 1, 3],
  ['梅花', 5, 5], ['長三', 3, 3], ['板凳', 2, 2], ['斧頭', 5, 6],
  ['紅頭十', 4, 6], ['高腳七', 1, 6], ['拎冧六', 1, 5],
];
const military = [['雜九', 3, 6], ['雜九', 4, 5], ['雜八', 2, 6], ['雜八', 3, 5], ['雜七', 2, 5], ['雜七', 3, 4], ['大么六', 2, 4], ['雜五', 1, 4], ['雜五', 2, 3], ['細么三', 1, 2]];
export const TILES = [
  ...civilians.flatMap(([name, a, b], i) => [0, 1].map(copy => ({ id: `c${i}-${copy}`, name, a, b, suit: 'c', rank: 11 - i, family: i }))),
  ...military.map(([name, a, b], i) => ({ id: `m${i}`, name, a, b, suit: 'm', rank: a + b, family: a + b })),
];
export const TILE = Object.fromEntries(TILES.map(t => [t.id, t]));
export const CIVILIANS = civilians;
const mixedRanks = [9, 8, 7, 5];
export const sortHand = ids => [...ids].sort((a, b) => TILE[a].suit.localeCompare(TILE[b].suit) || TILE[b].rank - TILE[a].rank || a.localeCompare(b));

export function combinations(ids, n) {
  const result = [];
  function visit(start, chosen) {
    if (chosen.length === n) { result.push(chosen); return; }
    for (let i = start; i <= ids.length - (n - chosen.length); i++) visit(i + 1, [...chosen, ids[i]]);
  }
  visit(0, []);
  return result;
}

export function pattern(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 4 || new Set(ids).size !== ids.length || ids.some(id => !TILE[id])) return null;
  const tiles = ids.map(id => TILE[id]);
  const c = tiles.filter(t => t.suit === 'c'), m = tiles.filter(t => t.suit === 'm');
  if (tiles.length === 1) return { kind: c.length ? 'single-c' : 'single-m', rank: tiles[0].rank, n: 1, name: tiles[0].name };
  if (tiles.length === 2 && m.some(t => t.rank === 6) && m.some(t => t.rank === 3)) return { kind: 'supreme-m', rank: 99, n: 2, name: '武尊' };
  if (tiles.length === 2 && c.length === 2 && c[0].family === c[1].family) {
    if (c[0].family === 10) return { kind: 'supreme-c', rank: 1, n: 2, name: '文尊' };
    return { kind: 'pair-c', rank: c[0].rank, n: 2, name: `${c[0].name}對` };
  }
  if (tiles.length === 2 && m.length === 2 && m[0].rank === m[1].rank) return { kind: 'pair-m', rank: m[0].rank, n: 2, name: `${m[0].name}對` };
  if (c.length && m.length && c.every(t => t.family === c[0].family) && m.every(t => t.rank === m[0].rank) && c[0].family < 4 && mixedRanks[c[0].family] === m[0].rank) {
    const group = ['天九', '地八', '人七', '和五'][c[0].family];
    const prefix = tiles.length === 2 ? '' : tiles.length === 4 ? '四' : c.length === 2 ? '三文' : '三武';
    return { kind: `mixed-${c.length}-${m.length}`, rank: 4 - c[0].family, n: tiles.length, name: prefix + group };
  }
  return null;
}

export function beats(candidate, top) {
  if (!candidate || !top || candidate.n !== top.n || top.kind === 'supreme-m' || top.kind === 'capture-c') return false;
  if (top.kind === 'supreme-c') return candidate.kind === 'pair-c' && candidate.rank === 2;
  // A pair of small sixes may follow as an ordinary, lowest civilian pair.
  if (candidate.kind === 'supreme-c') return false;
  return candidate.kind === top.kind && candidate.rank > top.rank;
}

function shuffled(rng) {
  const ids = TILES.map(t => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export function newGame(rng = Math.random) {
  return deal({ version: 1, round: 0, banker: Math.floor(rng() * 4), bankFactor: 2, totals: [0, 0, 0, 0], previous: null }, rng);
}

function deal(previous, rng) {
  const deck = shuffled(rng);
  const hands = Array.from({ length: 4 }, (_, i) => sortHand(deck.slice(i * 8, i * 8 + 8)));
  return { ...previous, round: previous.round + 1, phase: 'playing', hands, initialHands: hands.map(h => [...h]), won: [0, 0, 0, 0], history: [], ledger: [], roundDelta: [0, 0, 0, 0], turn: previous.banker, leader: previous.banker, trick: [], top: null, topPlayer: null, summary: null };
}

export function nextRound(state, rng = Math.random) {
  if (state.phase !== 'ended') throw new Error('這局尚未結束。');
  const winner = state.summary.winner;
  return deal({ version: 1, round: state.round, banker: winner, bankFactor: winner === state.banker ? state.bankFactor + 1 : 2, totals: [...state.totals], previous: state.summary }, rng);
}

export function publicView(state, player) {
  return {
    player, hand: [...state.hands[player]], ownInitial: [...state.initialHands[player]], turn: state.turn, leader: state.leader,
    won: [...state.won], banker: state.banker, bankFactor: state.bankFactor, top: state.top ? { ...state.top } : null,
    topPlayer: state.topPlayer, remaining: state.hands.map(h => h.length),
    visible: [...state.history.flatMap(h => h.plays.filter(p => !p.fold).flatMap(p => p.ids)), ...state.trick.filter(p => !p.fold).flatMap(p => p.ids)],
    played: state.trick.map(p => p.player), phase: state.phase,
  };
}

export function legalPlays(view) {
  if (view.phase !== 'playing' || view.turn !== view.player) return [];
  if (view.hand.length === 1 && view.won[view.player] === 0) return [];
  const ns = view.top ? [view.top.n] : [1, 2, 3, 4].filter(n => n <= view.hand.length);
  return ns.flatMap(n => combinations(view.hand, n).filter(ids => {
    const p = pattern(ids);
    return p && (!view.top || beats(p, view.top));
  }));
}

function tileCost(id, hand) {
  const t = TILE[id];
  let cost = t.suit === 'c' ? t.rank : t.rank + 1;
  if (hand.some(other => other !== id && TILE[other].suit === t.suit && TILE[other].family === t.family)) cost += 8;
  if (t.suit === 'm' && [6, 3].includes(t.rank) && hand.some(other => TILE[other].suit === 'm' && TILE[other].rank === (t.rank === 6 ? 3 : 6))) cost += 10;
  if ((t.suit === 'c' && t.family < 4 && hand.some(other => TILE[other].suit === 'm' && TILE[other].rank === mixedRanks[t.family])) || (t.suit === 'm' && hand.some(other => TILE[other].suit === 'c' && mixedRanks[TILE[other].family] === t.rank))) cost += 4;
  return cost;
}

export function chooseMove(view) {
  const plays = legalPlays(view);
  if (!view.top) {
    if (!plays.length) throw new Error('沒有可領出的牌。');
    const unknown = TILES.filter(t => !view.hand.includes(t.id) && !view.visible.includes(t.id)).map(t => t.id);
    const ranked = plays.map(ids => {
      const p = pattern(ids);
      // shortcut: a public-information heuristic, upgrade to search for stronger difficulty levels.
      const stronger = combinations(unknown, p.n).filter(other => beats(pattern(other), p)).length;
      const remainder = view.hand.filter(id => !ids.includes(id));
      const reserve = Math.max(0, ...remainder.map(id => TILE[id].rank));
      const urgent = view.won[view.player] === 0;
      const score = (stronger === 0 ? 28 : -Math.min(stronger, 20) * 2) + p.n * 2 + reserve * 0.6 - ids.reduce((a, id) => a + tileCost(id, view.hand), 0) * (urgent ? 0.05 : 0.3) + (p.kind.startsWith('supreme') ? 4 : 0);
      return { ids, score };
    }).sort((a, b) => b.score - a.score);
    return { ids: ranked[0].ids, fold: false };
  }
  if (plays.length) {
    plays.sort((a, b) => a.reduce((s, id) => s + tileCost(id, view.hand), 0) - b.reduce((s, id) => s + tileCost(id, view.hand), 0));
    return { ids: plays[0], fold: false };
  }
  const discards = combinations(view.hand, view.top.n);
  discards.sort((a, b) => a.reduce((s, id) => s + tileCost(id, view.hand), 0) - b.reduce((s, id) => s + tileCost(id, view.hand), 0));
  return { ids: discards[0], fold: true };
}

export function play(state, player, ids, fold = false) {
  if (state.phase !== 'playing' || state.turn !== player) throw new Error('還未輪到你出牌。');
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || !ids.length || ids.some(id => !state.hands[player].includes(id))) throw new Error('請先選擇自己的手牌。');
  if (!state.top && fold) throw new Error('你有領出權，請打出合法牌型。');
  if (state.top && ids.length !== state.top.n) throw new Error(`本輪要出或墊 ${state.top.n} 隻牌。`);
  let p = pattern(ids);
  if (!fold) {
    if (state.hands[player].length === 1 && state.won[player] === 0) throw new Error('你尚未取得一墩，尾輪單隻只能墊牌。');
    if (!p) throw new Error('這個組合不是合法牌型。');
    if (state.top && !beats(p, state.top)) throw new Error('需要同類型、而且比目前最大的牌更大；亦可選擇墊牌。');
    if (state.top?.kind === 'supreme-c') p = { ...p, kind: 'capture-c', name: '擒文尊' };
    state.top = p;
    state.topPlayer = player;
  }
  state.hands[player] = state.hands[player].filter(id => !ids.includes(id));
  state.trick.push({ player, ids: [...ids], fold, pattern: fold ? null : p });
  if (state.trick.length === 4) state.phase = 'collect';
  else state.turn = (player + 1) % 4;
  return state;
}

function transfer(state, from, to, amount, reason, detail) {
  if (!Number.isSafeInteger(amount)) throw new Error('分數超出支援範圍。');
  state.roundDelta[from] -= amount;
  state.roundDelta[to] += amount;
  state.totals[from] -= amount;
  state.totals[to] += amount;
  state.ledger.push({ from, to, amount, reason, detail });
}

function honor(state, winner, base, reason) {
  for (let i = 0; i < 4; i++) if (i !== winner) {
    const bank = winner === state.banker || i === state.banker ? state.bankFactor : 1;
    transfer(state, i, winner, base * bank, reason, `${base} × 莊倍 ${bank}`);
  }
}

function finish(state, last) {
  const winner = last.winner, p = last.pattern, lead = last.plays[0];
  const single = last.n === 1 ? TILE[last.plays.find(x => x.player === winner).ids[0]] : null;
  let special = 1, specialName = '普通結';
  if (last.n === 4) { special = 4; specialName = '四大賀結'; }
  else if (p.kind === 'supreme-m' || p.kind === 'supreme-c') { special = 2; specialName = '包尊結'; }
  else if (single && ((single.suit === 'm' && single.rank === 3) || (single.suit === 'c' && single.family === 10))) { special = 2; specialName = '么結'; }
  let culprit = null;
  if (p.kind === 'capture-c') culprit = lead.player;
  if (single && lead.pattern?.n === 1) {
    const low = TILE[lead.ids[0]];
    if ((low.suit === 'm' && low.rank === 3 && single.suit === 'm' && single.rank === 6) || (low.suit === 'c' && low.family === 10 && single.suit === 'c' && single.family === 9)) culprit = lead.player;
  }
  if (culprit !== null) { special = 4; specialName = '擒四包賠'; }
  let sweep = 1, sweepName = '';
  if (state.won[winner] === 8) {
    const known = new Set([...state.initialHands[winner], ...state.history.slice(0, -1).flatMap(h => h.plays.filter(x => !x.fold).flatMap(x => x.ids))]);
    const possiblyHigher = single && TILES.some(t => !known.has(t.id) && beats(pattern([t.id]), p));
    sweep = possiblyHigher ? 2 : 4;
    sweepName = possiblyHigher ? '七支結' : '八支結';
  }
  const multiplier = special * sweep;
  for (let i = 0; i < 4; i++) if (i !== winner) {
    const base = state.won[i] === 0 ? 5 : 4 - state.won[i];
    const bank = winner === state.banker || (i === state.banker && base > 0) ? state.bankFactor : 1;
    const amount = base * bank * multiplier;
    const from = amount > 0 && culprit !== null ? culprit : i;
    transfer(state, from, winner, amount, `${PLAYERS[i]}結算${from !== i ? `（${PLAYERS[from]}包賠）` : ''}`, `${state.won[i] === 0 ? '空墩 5' : `4 − ${state.won[i]} = ${base}`} × 莊倍 ${bank} × 結牌 ${special} × ${sweepName || '普通'} ${sweep}`);
  }
  state.summary = { winner, specialName, special, sweepName, sweep, multiplier, won: [...state.won], delta: [...state.roundDelta], ledger: state.ledger.map(x => ({ ...x })), round: state.round };
  state.phase = 'ended';
}

export function collect(state) {
  if (state.phase !== 'collect' || state.trick.length !== 4) throw new Error('還未到收墩時間。');
  const winner = state.topPlayer, p = state.top;
  state.won[winner] += p.n;
  const last = { winner, n: p.n, pattern: { ...p }, plays: state.trick.map(x => ({ ...x, ids: [...x.ids] })) };
  state.history.push(last);
  if (state.hands[0].length === 0) finish(state, last);
  else {
    if (['supreme-m', 'supreme-c', 'capture-c'].includes(p.kind)) honor(state, winner, 2, p.kind === 'capture-c' ? '擒文尊' : '賀尊');
    if (p.n === 4) honor(state, winner, 4, '四大賀');
    state.phase = 'playing';
    state.turn = winner;
    state.leader = winner;
    state.trick = [];
    state.top = null;
    state.topPlayer = null;
  }
  return state;
}

export function validateState(s) {
  if (!s || s.version !== 1 || !['playing', 'collect', 'ended'].includes(s.phase) || !Number.isSafeInteger(s.round) || s.round < 1 || !Number.isInteger(s.banker) || s.banker < 0 || s.banker > 3 || !Number.isSafeInteger(s.bankFactor) || s.bankFactor < 2) return false;
  if (![s.hands, s.initialHands].every(h => Array.isArray(h) && h.length === 4 && h.every(a => Array.isArray(a) && a.every(id => TILE[id])))) return false;
  if (!Array.isArray(s.history) || s.history.length > 8 || !Array.isArray(s.trick) || s.trick.length > 4 || !Array.isArray(s.ledger)) return false;
  if (![s.totals, s.roundDelta, s.won].every(a => Array.isArray(a) && a.length === 4 && a.every(Number.isSafeInteger))) return false;
  if (s.totals.reduce((a, b) => a + b, 0) !== 0 || s.roundDelta.reduce((a, b) => a + b, 0) !== 0) return false;
  if (![s.turn, s.leader].every(i => Number.isInteger(i) && i >= 0 && i < 4)) return false;
  if (s.phase === 'ended' && (!s.summary || !Number.isInteger(s.summary.winner) || s.summary.winner < 0 || s.summary.winner > 3)) return false;
  try {
    const past = s.history.flatMap(h => h.plays.flatMap(p => p.ids));
    const current = s.phase === 'ended' ? [] : s.trick.flatMap(p => p.ids);
    const all = [...s.hands.flat(), ...past, ...current];
    if (all.length !== 32 || new Set(all).size !== 32 || all.some(id => !TILE[id])) return false;
    if (s.initialHands.flat().length !== 32 || new Set(s.initialHands.flat()).size !== 32) return false;
    if (s.won.some((n, i) => n !== s.history.filter(h => h.winner === i).reduce((a, h) => a + h.n, 0))) return false;
    if (s.phase === 'collect' && s.trick.length !== 4) return false;
    if (s.phase === 'playing' && (s.trick.length === 4 || (s.trick.length > 0 && (!s.top || s.topPlayer === null)))) return false;
    return true;
  } catch { return false; }
}
