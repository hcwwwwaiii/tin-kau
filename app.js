import { PLAYERS, TILES, TILE, CIVILIANS, pattern, newGame, nextRound, publicView, legalPlays, chooseMove, play, collect, validateState } from './engine.js';

const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const signed = value => value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
const KEY = 'tin-kau.table.v1', OPTIONS_KEY = 'tin-kau.options.v1';
let state = null, selected = [], timer, notice = '', lastMessage = '', storageOkay = true, audio;
let options = { names: true, sound: false, speed: 650 };
try {
  const savedOptions = JSON.parse(localStorage.getItem(OPTIONS_KEY));
  if (savedOptions) options = { names: savedOptions.names !== false, sound: savedOptions.sound === true, speed: [250, 650, 1000].includes(savedOptions.speed) ? savedOptions.speed : 650 };
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && validateState(saved)) state = saved;
  else if (saved) notice = '儲存的牌局未能讀取，請重新開局。';
} catch { storageOkay = false; }

const icons = {
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><rect x="7" y="4" width="4" height="6" rx="1" fill="var(--ground)"/><rect x="14" y="14" width="4" height="6" rx="1" fill="var(--ground)"/></svg>',
};
$('settings-open').innerHTML = icons.settings;

const dotPositions = {
  1: [[15, 15]], 2: [[7, 7], [23, 23]], 3: [[7, 7], [15, 15], [23, 23]],
  4: [[7, 7], [23, 7], [7, 23], [23, 23]], 5: [[7, 7], [23, 7], [15, 15], [7, 23], [23, 23]],
  6: [[7, 6], [23, 6], [7, 15], [23, 15], [7, 24], [23, 24]],
};

function tileMarkup(id, down = false) {
  if (down) return '<span class="tile face-down" aria-label="暗牌"></span>';
  const t = TILE[id];
  const halves = [t.a, t.b].map((n, half) => dotPositions[n].map(([x, y]) => {
    const red = n === 1 || n === 4 || (t.a === 6 && t.b === 6 && x === 23);
    return `<circle cx="${x + 5}" cy="${y + half * 34 + 2}" r="${n === 1 ? 4 : 2.8}" fill="${red ? '#ac342f' : '#202922'}"/>`;
  }).join('')).join('');
  return `<span class="tile" role="img" aria-label="${t.name}，${t.a}點配${t.b}點"><svg viewBox="0 0 40 70" aria-hidden="true"><path d="M6 35h28" stroke="#b8ac90" stroke-width=".7"/>${halves}</svg></span>`;
}

function sound(type = 'tile') {
  if (!options.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(type === 'collect' ? 520 : 900, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(240, audio.currentTime + .07);
    gain.gain.setValueAtTime(.06, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .08);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + .09);
  } catch { /* Sound is optional when the browser blocks audio. */ }
}

function save() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    storageOkay = true;
  } catch { storageOkay = false; }
}

function myTurn() { return state?.phase === 'playing' && state.turn === 0; }
function paused() { return document.hidden || !!document.querySelector('dialog[open]'); }

function renderSeat(player) {
  const count = state ? state.hands[player].length : 8;
  const active = state?.phase === 'playing' && state.turn === player;
  const won = state?.won[player] ?? 0, total = state?.totals[player] ?? 0;
  $(`seat-${player}`).innerHTML = `<div class="seat-name">${active ? '<span class="active-marker" aria-label="輪到出牌"></span>' : ''}${PLAYERS[player]}${state?.banker === player ? '<span class="banker">莊</span>' : ''}</div><p class="seat-meta">${won} 墩 · ${signed(total)} 分</p><div class="backs" aria-label="剩餘 ${count} 隻暗牌">${Array.from({ length: count }, () => '<span class="back-mini" aria-hidden="true"></span>').join('')}</div>`;
}

function renderTable() {
  if (!state) {
    $('table-content').innerHTML = `<div class="welcome"><div class="intro-tiles" aria-hidden="true">${['c0-0', 'c1-0', 'c2-0', 'c3-0'].map(id => tileMarkup(id)).join('')}</div><h2>開一枱，打天九。</h2><p>你與三位電腦對手<br>八隻牌，留一手爭尾墩。</p><button class="primary" data-action="start">開始牌局</button></div>`;
    return;
  }
  if (state.phase === 'ended') {
    const r = state.summary, win = r.winner === 0;
    $('table-content').innerHTML = `<div class="round-end"><span class="tagline">第 ${state.round} 局 · 結牌</span><h2>${win ? '你結牌了' : `${PLAYERS[r.winner]}結牌`}</h2><div class="end-score">${signed(r.delta[0])}<small> 分</small></div><p>${escape([r.specialName, r.sweepName].filter(Boolean).join(' · '))} · 你取得 ${r.won[0]} 墩</p><div class="end-actions"><button class="secondary" data-action="settlement">查看結算</button><button class="primary" data-action="next">下一局</button></div></div>`;
    return;
  }
  const slots = [2, 3, 1, 0].map(player => {
    const p = state.trick.find(p => p.player === player);
    const label = p ? p.fold ? `${PLAYERS[player]} · 墊牌` : `${PLAYERS[player]} · ${p.pattern.name}` : state.turn === player ? `${PLAYERS[player]}出牌中` : '';
    return `<div class="played-slot player-${player}${p && !p.fold && state.topPlayer === player ? ' winning' : ''}"><div class="played-tiles">${p ? p.ids.map(id => tileMarkup(id, p.fold)).join('') : ''}</div><span class="played-label">${escape(label)}</span></div>`;
  }).join('');
  const middle = state.phase === 'collect' ? `${PLAYERS[state.topPlayer]}<br>食 ${state.top.n} 墩` : `第 ${state.history.reduce((s, h) => s + h.n, 0) + 1} 墩<br>↺`;
  $('table-content').innerHTML = `<div class="trick-board">${slots}<div class="compass">${middle}</div></div>`;
}

function renderHand() {
  const hand = state ? state.hands[0] : ['c0-0', 'm0', 'c2-0', 'c3-0', 'c4-0', 'c7-0', 'm6', 'm9'];
  const focus = document.activeElement?.dataset?.tile;
  $('hand').classList.toggle('names-hidden', !options.names);
  $('hand').innerHTML = hand.map(id => `<button class="tile-button${selected.includes(id) ? ' selected' : ''}" data-tile="${id}" aria-label="${TILE[id].name}，${TILE[id].a}配${TILE[id].b}${selected.includes(id) ? '，已選取' : ''}" aria-pressed="${selected.includes(id)}" ${!myTurn() ? 'disabled' : ''}>${tileMarkup(id)}<span class="tile-name" aria-hidden="true">${TILE[id].name}</span></button>`).join('');
  if (focus) $('hand').querySelector(`[data-tile="${focus}"]`)?.focus({ preventScroll: true });
  $('hand-count').textContent = `${hand.length} 隻`;
  $('self-banker').innerHTML = state?.banker === 0 ? '<span class="banker">莊</span>' : '';
  $('self-score').textContent = `${state?.won[0] ?? 0} 墩 · ${signed(state?.totals[0] ?? 0)} 分`;
  const top = state?.top, p = pattern(selected);
  const legal = myTurn() && legalPlays(publicView(state, 0)).some(ids => ids.length === selected.length && ids.every(id => selected.includes(id)));
  $('play').disabled = !legal;
  $('fold').disabled = !myTurn() || !top || selected.length !== top.n;
  $('hint').disabled = !myTurn();
  $('clear-selection').disabled = !selected.length;
  $('play').textContent = selected.length && legal ? `出牌 · ${selected.length} 隻` : '出牌';
  $('fold').textContent = top ? `墊 ${top.n} 隻` : '墊牌';
  let selectionText = myTurn() ? top ? `本輪 ${top.n} 隻 · ${top.name}，可壓牌或暗墊` : '你有領出權，選 1–4 隻合法牌型' : '點選骨牌，再選擇出牌或墊牌';
  if (selected.length) {
    if (top && selected.length !== top.n) selectionText = `已選 ${selected.length} 隻，本輪需要 ${top.n} 隻`;
    else if (!top && !p) selectionText = '不是合法牌型，請改選單隻、對牌或指定組合';
    else if (top && !legal) selectionText = '這組牌不能壓過目前最大牌，可以暗墊';
    else selectionText = `已選 ${selected.length} 隻 · ${p.name}`;
  }
  $('selection-label').textContent = selectionText;
}

function render() {
  for (let i = 1; i < 4; i++) renderSeat(i);
  renderTable(); renderHand();
  $('round-label').textContent = state ? `第 ${state.round} 局` : '準備入座';
  $('bank-info').textContent = state ? `${PLAYERS[state.banker]}做莊 · ${state.bankFactor} 倍` : '你與三位電腦對手';
  let status = '入座後，由莊家先出牌。';
  if (state?.phase === 'ended') status = '本局已結算，可以查看明細或開始下一局。';
  else if (state?.phase === 'collect') status = `${PLAYERS[state.topPlayer]}最大，收 ${state.top.n} 墩。`;
  else if (myTurn()) status = state.hands[0].length === 1 && state.won[0] === 0 ? '你未有墩，尾輪單隻必須墊牌。' : state.top ? '輪到你了 · 壓過目前最大牌，或選擇暗墊。' : '輪到你領出 · 單隻、對牌或文武組合。';
  else if (state) status = `${PLAYERS[state.turn]}正在想牌…`;
  $('turn-status').textContent = notice || status;
  $('turn-status').classList.toggle('error', !!notice);
  $('last-action').textContent = lastMessage || (state?.history.length ? `${PLAYERS[state.history.at(-1).winner]}上輪取得 ${state.history.at(-1).n} 墩。` : '有大牌亦可墊牌，留一手爭尾墩。');
  $('save-note').textContent = storageOkay ? '牌局只儲存在這個瀏覽器 · 純積分遊戲' : '這個瀏覽器未能儲存牌局；重新整理後可能遺失進度。';
  $('sound-toggle').innerHTML = options.sound ? icons.sound : icons.muted;
  $('sound-toggle').setAttribute('aria-label', options.sound ? '關閉音效' : '開啟音效');
  $('sound-toggle').setAttribute('aria-pressed', String(options.sound));
}

function schedule() {
  clearTimeout(timer);
  if (!state || paused() || state.phase === 'ended' || myTurn()) return;
  timer = setTimeout(() => {
    if (paused()) return;
    try {
      notice = '';
      if (state.phase === 'collect') {
        const who = PLAYERS[state.topPlayer], n = state.top.n;
        collect(state); sound('collect');
        lastMessage = `${who}食 ${n} 墩${state.phase === 'ended' ? '，本局結牌。' : '，取得領出權。'}`;
      } else {
        const who = state.turn, action = chooseMove(publicView(state, who));
        play(state, who, action.ids, action.fold); sound();
        lastMessage = action.fold ? `${PLAYERS[who]}暗墊 ${action.ids.length} 隻。` : `${PLAYERS[who]}打出${pattern(action.ids).name}。`;
      }
      save(); render(); schedule();
    } catch (error) { notice = `牌局暫停：${error.message}`; render(); }
  }, state.phase === 'collect' ? Math.max(950, options.speed * 1.5) : options.speed);
}

function begin() {
  clearTimeout(timer);
  state = newGame(); selected = []; notice = ''; lastMessage = `${PLAYERS[state.banker]}做莊，先領出。`;
  save(); render(); schedule();
}

function submit(fold) {
  try {
    const chosen = [...selected];
    play(state, 0, chosen, fold);
    lastMessage = fold ? `你暗墊 ${chosen.length} 隻。` : `你打出${pattern(chosen).name}。`;
    selected = []; notice = ''; sound(); save(); render(); schedule();
  } catch (error) { notice = error.message; render(); }
}

$('hand').addEventListener('click', event => {
  const button = event.target.closest('[data-tile]');
  if (!button || !myTurn()) return;
  const id = button.dataset.tile;
  if (selected.includes(id)) selected = selected.filter(x => x !== id);
  else {
    const max = state.top?.n ?? 4;
    if (selected.length >= max) { notice = `本輪最多選 ${max} 隻，先取消其他選牌。`; render(); return; }
    selected.push(id);
  }
  notice = ''; renderHand();
  $('turn-status').classList.remove('error');
  $('turn-status').textContent = myTurn() ? '選好後按「出牌」或「墊牌」。' : '';
});
$('hand').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const buttons = [...$('hand').querySelectorAll('button:not(:disabled)')];
  const current = buttons.indexOf(document.activeElement);
  if (current < 0) return;
  event.preventDefault(); buttons[(current + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
});
$('play').addEventListener('click', () => submit(false));
$('fold').addEventListener('click', () => submit(true));
$('clear-selection').addEventListener('click', () => { selected = []; notice = ''; render(); });
$('hint').addEventListener('click', () => {
  if (!myTurn()) return;
  const action = chooseMove(publicView(state, 0));
  selected = action.ids; render();
  $('turn-status').textContent = action.fold ? '建議暗墊已選的牌，保留其餘牌組。' : `建議出${pattern(action.ids).name}；你亦可改選。`;
});
$('table-content').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'start') begin();
  if (action === 'settlement') showScores();
  if (action === 'next' && state?.phase === 'ended') {
    state = nextRound(state); selected = []; notice = ''; lastMessage = `${PLAYERS[state.banker]}做莊，${state.bankFactor} 倍。`;
    save(); render(); schedule();
  }
});

function showDialog(id) { clearTimeout(timer); $(id).showModal(); }
function closeDialog(id) { $(id).close(); schedule(); }
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.dialog-close').addEventListener('click', () => closeDialog(dialog.id));
  dialog.addEventListener('close', schedule);
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDialog(dialog.id);
  });
}

function info(title, content) { $('info-title').textContent = title; $('info-content').innerHTML = content; if (!$('info-dialog').open) showDialog('info-dialog'); }

function helpTab(tab = 'tiles') {
  const tabs = `<div class="dialog-tabs" role="tablist" aria-label="牌譜與玩法">${[['tiles', '認牌'], ['play', '玩法'], ['rules', '本枱房規']].map(([id, label]) => `<button id="help-tab-${id}" role="tab" aria-controls="help-panel" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}" data-help="${id}">${label}</button>`).join('')}</div>`;
  let content;
  if (tab === 'tiles') {
    const civil = CIVILIANS.map((_, i) => TILE[`c${i}-0`]);
    const catalog = tiles => `<div class="tile-catalog">${tiles.map(t => `<div class="catalog-item">${tileMarkup(t.id)}<span>${t.name}</span><small>${t.a}・${t.b}${t.suit === 'c' ? ' × 2' : ''}</small></div>`).join('')}</div>`;
    content = `<div class="rule-copy"><h3>文子 · 22 隻</h3><p>由大至小，每款各兩隻。文子只跟文子比較。</p>${catalog(civil)}<h3>武子 · 10 隻</h3><p>單隻大小：九 ＞ 八 ＞ 七 ＞ 六 ＞ 五 ＞ 三。同點數的兩隻武子一樣大。</p>${catalog(TILES.filter(t => t.suit === 'm'))}<h3>文武組合</h3><p>天配九、地配八、人配七、和配五，由大至小。可出一文一武、兩文一武、一文兩武、兩文兩武。同樣數量及文武比例才可互壓。</p><h3>至尊</h3><p>武尊：大么六（二四）配細么三（一二），只可領出，無牌可壓。文尊：一對拎冧六領出，只有一對高腳七可擒。</p></div>`;
  } else if (tab === 'play') {
    content = `<div class="rule-copy"><h3>先食墩，再爭尾墩</h3><p>四人各取八隻牌，莊家先出，按逆時針輪流。你在下方，下一位係右方東家，再到北家、西家。</p><ol><li><strong>領出：</strong>選 1–4 隻合法牌型。雙文要相同牌；雙武只限同點數九、八、七、五，另有至尊及指定文武組合。</li><li><strong>跟出：</strong>出同數量、同類型而且更大的牌。同牌先出者大，文武不能互打。</li><li><strong>暗墊：</strong>任何時候可放棄爭勝，暗墊相同數量的任意手牌，即使有大牌亦可墊。</li><li><strong>收墩：</strong>四人出完，最大者取得本輪所有骨牌及下輪領出權。每四隻牌是一墩，所以贏對牌得兩墩。</li><li><strong>結牌：</strong>贏最後一輪者結牌，亦是下一局莊家。結牌後至少要有兩墩；頭七隻仍零墩，最後單隻再大亦必須暗墊。最後以兩隻以上組合取得足夠墩數則可結。</li></ol><h3>操作</h3><p>點選手牌，再按「出牌」或「墊牌」；再次點擊可以取消。電腦可用 Tab、方向鍵及空白鍵操作。提示只會幫你選牌，由你決定是否打出。</p><h3>暫停與儲存</h3><p>打開視窗或切到其他分頁會暫停電腦回合。進度與分數儲存在目前瀏覽器，重新整理可接續；不同裝置的進度各自獨立。</p></div>`;
  } else {
    content = `<div class="rule-copy"><p>本枱採用以下固定房規，全部以積分結算。</p><h3>歸本與連莊</h3><p>非結牌者按「4 − 墩數」向結牌者支付；空墩付 5 分。五墩、六墩者反向收 1、2 分。初莊兩倍，同一人繼續做莊則三倍、四倍遞增。結牌者是莊，全部收付乘莊倍；落莊者只有付款乘莊倍，入一、入二的收入不乘。</p><h3>文尊、武尊與四大賀</h3><p>開文尊及擒文尊。一對高腳七擒住文尊後，該輪不能再被壓。非尾輪賀尊由勝方向其餘三家各收基本 2 分；四大賀各收 4 分，再按莊家關係乘莊倍。尾輪不另收賀錢。</p><h3>特殊結牌</h3><p>細么三或單隻拎冧六結牌 ×2；包文尊、武尊結 ×2；四大賀結 ×4。</p><h3>么雙擒四、包賠</h3><p>尾輪領出細么三，最終被大么六結牌；領出拎冧六，最終被高腳七結牌；或尾輪文尊被高腳七對擒住，均以 ×4 結算。被擒者代付其餘輸家的結牌付款。若被一般大牌結走，則普通結算。</p><h3>七支、八支與疊乘</h3><p>全取八墩時，尾輪兩隻以上組合，或單隻在結牌者已知資訊中無可能被壓，算八支 ×4；否則靠其餘三家零墩而取得尾墩，算七支 ×2。已知資訊包括自己起手八隻及此前所有亮牌，其他人的暗墊不能當已知。<strong>不設首輪不可出頂大的限制。</strong></p><p>莊倍、結牌倍數及七支／八支倍數相乘。例如初莊八支以武尊結：空墩基本 5 × 莊倍 2 × 包尊 2 × 八支 4，每家付 80 分。之前各輪賀錢獨立計算。</p><h3>其他約定</h3><p>首局隨機選莊，電腦均勻洗牌，每人派八隻。不設起手例牌、不設真金錢下注。電腦只可使用自己的手牌及公開資訊。</p><p>規則背景：<a href="https://www.tin9club.com/how-to-play" target="_blank" rel="noopener">天九至尊神學研究中心</a>、<a href="https://www.weweweb.net/game/webpage/skydog-howto_c.html" target="_blank" rel="noopener">WeWeWeb 天九</a>。不同牌局可能採用其他房規，本遊戲以上述約定為準。</p></div>`;
  }
  info('牌譜與玩法', tabs + `<div role="tabpanel" id="help-panel" aria-labelledby="help-tab-${tab}" tabindex="0">${content}</div>`);
}
$('help-open').addEventListener('click', () => helpTab());
$('info-content').addEventListener('click', event => { const tab = event.target.closest('[data-help]')?.dataset.help; if (tab) { helpTab(tab); $(`help-tab-${tab}`).focus(); } });
$('info-content').addEventListener('keydown', event => {
  if (!event.target.matches('[data-help]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = ['tiles', 'play', 'rules'], current = tabs.indexOf(event.target.dataset.help);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (current + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
  helpTab(tabs[next]); $(`help-tab-${tabs[next]}`).focus();
});

function ledgerMarkup(entries) {
  if (!entries.length) return '<p class="empty-copy">這局尚未有賀分或結牌分數。</p>';
  return `<ul class="ledger">${entries.map(e => {
    const from = e.amount >= 0 ? e.from : e.to, to = e.amount >= 0 ? e.to : e.from;
    return `<li><div><span>${escape(e.reason)} · ${PLAYERS[from]} → ${PLAYERS[to]}</span><strong>${Math.abs(e.amount).toLocaleString()} 分</strong></div><small>${escape(e.detail)}</small></li>`;
  }).join('')}</ul>`;
}
function showScores() {
  if (!state) { info('計分簿', '<p class="empty-copy">開始牌局後，這裡會列出各家墩數、分數及計算明細。</p>'); return; }
  const r = state.summary;
  const title = r ? `第 ${state.round} 局結算` : `第 ${state.round} 局計分簿`;
  const intro = r ? `<p>${PLAYERS[r.winner]}結牌 · ${escape([r.specialName, r.sweepName].filter(Boolean).join(' · '))} · 結牌合計 ${r.multiplier} 倍（另計莊倍）</p>` : '<p>未結牌；本局分數目前只包含已結算的賀錢。</p>';
  const table = `<table class="score-table"><thead><tr><th>玩家</th><th>墩數</th><th>本局</th><th>累積</th></tr></thead><tbody>${PLAYERS.map((name, i) => `<tr class="${i === 0 ? 'self' : ''}"><td>${name}${state.banker === i ? ' · 莊' : ''}</td><td>${state.won[i]}</td><td>${signed(state.roundDelta[i])}</td><td>${signed(state.totals[i])}</td></tr>`).join('')}</tbody></table>`;
  info(title, intro + table + '<h3>逐項計算</h3>' + ledgerMarkup(state.ledger));
}
$('scores-open').addEventListener('click', showScores);
$('history-open').addEventListener('click', () => {
  if (!state?.history.length) { info('本局記錄', '<p class="empty-copy">完成第一輪後，這裡會記下亮牌與各家取得的墩數。暗墊牌保持隱藏。</p>'); return; }
  info('本局記錄', [...state.history].reverse().map((h, index) => `<section class="history-round"><h3>第 ${state.history.length - index} 輪 · ${PLAYERS[h.winner]}食 ${h.n} 墩 · ${escape(h.pattern.name)}</h3><div class="history-plays">${h.plays.map(p => `<div><small>${PLAYERS[p.player]}${p.fold ? ' · 暗墊' : ''}</small><div class="played-tiles">${p.ids.map(id => tileMarkup(id, p.fold)).join('')}</div></div>`).join('')}</div></section>`).join(''));
});

function syncSettings() { $('names-setting').checked = options.names; $('sound-setting').checked = options.sound; $('speed-setting').value = String(options.speed); }
$('settings-open').addEventListener('click', () => { syncSettings(); showDialog('settings-dialog'); });
$('sound-toggle').addEventListener('click', () => { options.sound = !options.sound; sound(); save(); render(); });
$('names-setting').addEventListener('change', event => { options.names = event.target.checked; save(); render(); });
$('sound-setting').addEventListener('change', event => { options.sound = event.target.checked; sound(); save(); render(); });
$('speed-setting').addEventListener('change', event => { options.speed = Number(event.target.value); save(); schedule(); });
$('new-match').addEventListener('click', () => showDialog('reset-dialog'));
$('reset-cancel').addEventListener('click', () => closeDialog('reset-dialog'));
$('reset-confirm').addEventListener('click', () => { $('reset-dialog').close(); $('settings-dialog').close(); begin(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else schedule(); });
window.addEventListener('pagehide', save);
render(); schedule();
