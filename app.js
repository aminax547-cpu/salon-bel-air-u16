/* =====================================================================
 * Salon Bel Air Foot — Plateforme multi-catégories (SPA)
 * Router hash (#/ , #/u16, #/u19, …) + dashboard + vues catégories
 * ===================================================================== */

const CLUB_FILE = './data/club.json';

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
function dateLongue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ---------------- Chargement ---------------- */
async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* =====================================================================
 *  ROUTER
 * ===================================================================== */
let clubConfig = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  return h[0] || '';
}

async function router() {
  const app = el('app');
  const route = parseHash();
  document.querySelectorAll('.nav-link').forEach((a) => a.classList.remove('active'));
  document.querySelectorAll('.dropdown-item').forEach((a) => a.classList.remove('active'));

  const cat = clubConfig?.categories?.find((c) => c.id === route);
  if (cat) {
    el('catBtnLabel').textContent = cat.libelle;
    document.querySelector(`[data-cat="${route}"]`)?.classList.add('active');
  } else if (route === '') {
    document.querySelector('[data-nav="home"]')?.classList.add('active');
    el('catBtnLabel').textContent = 'Équipes';
  }

  app.innerHTML = skeletonPage();

  if (!route) return renderDashboard(app);
  if (route === 'stats') return renderStatsGlobale(app);
  if (route === 'calendrier') return renderCalendarGlobal(app);

  if (!cat || !cat.actif || !cat.fichier) return renderBientot(app, route);
  return renderCat(app, cat);
}

/* =====================================================================
 *  SQUELETTES (shimmer)
 * ===================================================================== */
function skeletonPage() {
  return `
    <div class="skel hero-shimmer"></div>
    <div class="skel line w60"></div>
    <div class="skel line w40"></div>
    <div class="glass" style="margin-top:22px"><div class="skel table-shimmer"></div></div>`;
}

/* =====================================================================
 *  DASHBOARD ACCUEIL
 * ===================================================================== */
async function renderDashboard(app) {
  const club = clubConfig || (clubConfig = await getJSON(CLUB_FILE));
  // fusionner les actus générées par l'IA (data/actus/*.json) avec celles du club
  let actusIA = [];
  try {
    const list = await getJSON('./data/actus/index.json');
    actusIA = list.actualites || [];
  } catch (_) {
    // pas d'index : on essaie les fichiers connus en dur (générés par l'Action)
    for (const f of ['u16-j4.json', 'u16-j3.json', 'u19-j3.json']) {
      try {
        const a = await getJSON('./data/actus/' + f);
        actusIA.push(a);
      } catch (_) { /* ignore */ }
    }
  }
  const toutes = [...(club.actualites || []), ...actusIA]
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const catsCard = club.categories.map((c) => {
    const active = c.actif && c.fichier;
    return `
      <a class="cat-card ${active ? '' : 'inactive'}" href="#/${c.id}">
        <div class="cat-head">
          <span class="cat-lib">${c.libelle}</span>
          ${active ? '<span class="cat-live"><span class="dot"></span> LIVE</span>' : '<span class="cat-soon">Bientôt</span>'}
        </div>
        <div class="cat-nom">${esc(c.nom)}</div>
        <div class="cat-sub">${esc(c.poule || '—')} · ${esc(c.niveau || '—')}</div>
      </a>`;
  }).join('');

  const actus = toutes.map((a) => `
      <div class="actu">
        <div class="actu-emoji">${a.emoji || '📰'}</div>
        <div class="actu-body">
          <div class="actu-meta"><span class="pill">${esc(a.categorie)}</span> ${dateCourte(a.date)}</div>
          <div class="actu-titre">${esc(a.titre)}</div>
          <div class="actu-texte">${esc(a.texte)}</div>
        </div>
      </div>`).join('');

  app.innerHTML = `
    <section class="hero">
      <h2>La saison <em>du club.</em></h2>
      <p>Tous les classements, statistiques et calendriers des équipes de <strong style="color:#fff">Salon Bel Air Foot</strong> — alimentés par les données officielles FFF.</p>
    </section>

    <section class="cat-grid">${catsCard}</section>

    <section class="glass" style="margin-top:26px">
      <div class="card-head"><h3>🗞️ Fil d'actualité du club</h3><div class="meta">généré après chaque journée</div></div>
      <div class="actus">${actus || '<div class="status">Aucune actualité pour le moment.</div>'}</div>
    </section>`;
}

/* =====================================================================
 *  VUE CATÉGORIE
 * ===================================================================== */
async function renderCat(app, cat) {
  let d;
  try {
    d = await getJSON(cat.fichier);
  } catch (e) {
    app.innerHTML = `<div class="glass"><div class="status err">⚠️ Impossible de charger ${esc(cat.nom)}.</div></div>`;
    return;
  }

  const sba = (d.classement || []).find((r) => r.isBelAir) || {};
  const next = d.prochainMatch;

  app.innerHTML = `
    <section class="hero cat-hero">
      <div style="display:flex;align-items:center;gap:16px;justify-content:center;flex-wrap:wrap">
        <div class="big-lib">${cat.libelle}</div>
        <div>
          <h2 style="font-size:clamp(1.6rem,4vw,2.6rem)">${esc(cat.nom)}</h2>
          <p>${esc(d.poule || '')} · ${esc(d.competition || 'District Provence')} · MAJ ${esc(d.updatedLabel || '')}</p>
        </div>
      </div>
      ${sba.pos ? `<div class="hero-pos"><b>${sba.pos}</b><span>/ ${(d.classement || []).length}</span></div>` : ''}
    </section>

    <div class="tabs" id="catTabs">
      <button class="tab active" data-tab="classement">Classement</button>
      <button class="tab" data-tab="stats">Stats</button>
      <button class="tab" data-tab="calendrier">Calendrier</button>
      <button class="tab" data-tab="equipe">Équipe</button>
    </div>

    <div id="tabContent"></div>`;

  const tabBox = el('tabContent');
  function showTab(name) {
    document.querySelectorAll('#catTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    tabBox.classList.add('fade-in');
    setTimeout(() => tabBox.classList.remove('fade-in'), 350);
    if (name === 'classement') tabBox.innerHTML = buildClassement(d);
    else if (name === 'stats') tabBox.innerHTML = buildStats(d, cat);
    else if (name === 'calendrier') tabBox.innerHTML = buildCalendrier(d);
    else if (name === 'equipe') tabBox.innerHTML = buildEquipe(d, cat);
  }
  document.querySelectorAll('#catTabs .tab').forEach((t) =>
    t.addEventListener('click', () => showTab(t.dataset.tab))
  );
  showTab('classement');

  if (next?.date) {
    startCountdown(next.date);
    loadWeather(next.date);
  }
}

/* ---------------- Compte à rebours + météo ---------------- */
let countdownTimer = null;
function startCountdown(iso) {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return;
  if (countdownTimer) clearInterval(countdownTimer);
  window.__cdTarget = target;
  countdownTimer = setInterval(refreshCountdown, 1000);
}
function refreshCountdown() {
  const box = el('cdBox');
  if (!box || !window.__cdTarget) return;
  const diff = window.__cdTarget.getTime() - Date.now();
  if (diff <= 0) { box.innerHTML = '<b>Jour de match ! ⚽</b>'; clearInterval(countdownTimer); return; }
  const j = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;
  box.innerHTML = `
    <div class="cd-num">${j}<span>jours</span></div>
    <div class="cd-num">${h}<span>h</span></div>
    <div class="cd-num">${m}<span>min</span></div>
    <div class="cd-num">${s}<span>sec</span></div>`;
}

async function loadWeather(iso) {
  const box = el('wdBox');
  if (!box) return;
  const d = new Date(iso);
  const ymd = d.toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=43.6476&longitude=5.1112&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Europe%2FParis&start_date=${ymd}&end_date=${ymd}`);
    const w = await r.json();
    const code = (w.daily?.weather_code || [])[0];
    const tmax = (w.daily?.temperature_2m_max || [])[0];
    const tmin = (w.daily?.temperature_2m_min || [])[0];
    const wx = getWx(code);
    box.innerHTML = `<div class="wx"><span class="wx-ico">${wx.ico}</span><span>${wx.label} · ${Math.round(tmin ?? 0)}° / ${Math.round(tmax ?? 0)}°</span></div>`;
  } catch (_) {
    box.innerHTML = '';
  }
}
function getWx(code) {
  if (code == null) return { ico: '🌤️', label: 'Prévision' };
  if (code === 0 || code === 1) return { ico: '☀️', label: 'Soleil' };
  if (code === 2) return { ico: '🌤️', label: 'Partiellement nuageux' };
  if (code === 3) return { ico: '☁️', label: 'Nuageux' };
  if (code >= 45 && code <= 48) return { ico: '🌫️', label: 'Brouillard' };
  if (code >= 51 && code <= 67) return { ico: '🌧️', label: 'Pluie' };
  if (code >= 71 && code <= 77) return { ico: '🌨️', label: 'Neige' };
  if (code >= 80 && code <= 82) return { ico: '🌦️', label: 'Averses' };
  if (code >= 95) return { ico: '⛈️', label: 'Orage' };
  return { ico: '🌤️', label: 'Prévision' };
}

/* ---------------- Classement ---------------- */
function buildClassement(d) {
  const rows = (d.classement || []).slice().sort((a, b) => a.pos - b.pos);
  if (!rows.length) return '<div class="status">Aucun classement.</div>';
  const maxBp = Math.max(...rows.map((r) => r.bp || 0), 1);
  let html = `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>Équipe</th><th>Pts</th><th>J</th><th>G</th><th>N</th><th>P</th>
      <th>BP</th><th>BC</th><th>Diff</th><th>Forme</th>
    </tr></thead><tbody>`;
  for (const t of rows) {
    const diff = t.diff ?? t.bp - t.bc;
    const diffCls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : '';
    const serie = (t.serie || []).slice(-5).map((s) => `<i class="${s}">${s}</i>`).join('');
    const perf = Math.round(((t.bp || 0) / maxBp) * 100);
    html += `<tr class="${t.isBelAir ? 'is-belair' : ''}">
      <td class="pos">${t.pos}</td>
      <td class="team"><div class="team-inline"><span class="team-dot"></span><span>${esc(t.club)}${t.isBelAir ? ' ⭐' : ''}</span>
        <span class="mini-bar"><span style="width:${perf}%"></span></span></div></td>
      <td class="pts">${esc(t.pts)}</td>
      <td>${t.j ?? 0}</td><td>${t.g ?? 0}</td><td>${t.n ?? 0}</td><td>${t.p ?? 0}</td>
      <td>${t.bp ?? 0}</td><td>${t.bc ?? 0}</td>
      <td class="diff ${diffCls}">${diff > 0 ? '+' : ''}${diff}</td>
      <td><span class="serie">${serie || '—'}</span></td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  return html;
}

/* ---------------- Stats "pro" ---------------- */
function buildStats(d, cat) {
  const s = d.stats || {};
  const forme = (s.serie || []).map((r) => `<i class="${r}">${r}</i>`).join('');
  const cleanTxt = `${s.cleanSheets || 0}/${s.matchsJoues || 0} matchs (${s.cleanSheetsPct || 0}%)`;
  const domBars = barStats(s.domicile, 'Domicile');
  const extBars = barStats(s.exterieur, 'Extérieur');

  return `
    <div class="glass-in">
      <div class="card-head"><h3>📊 Forme de l'équipe</h3><div class="meta">5 derniers matchs</div></div>
      <div style="padding:18px 20px">
        <div class="forme-line"><span class="serie big">${forme || '—'}</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-top:16px">
          <div class="stat-box"><b>${s.moyenneMarques ?? 0}</b><span>buts marqués / match</span></div>
          <div class="stat-box"><b>${s.moyenneEncaisses ?? 0}</b><span>buts encaissés / match</span></div>
          <div class="stat-box"><b>${s.cleanSheetsPct ?? 0}%</b><span>clean sheets</span><small>${cleanTxt}</small></div>
          <div class="stat-box"><b>${s.matchsJoues ?? 0}</b><span>matchs joués</span></div>
        </div>
      </div>
    </div>

    <div class="glass-in" style="margin-top:16px">
      <div class="card-head"><h3>🏟️ Domicile vs Extérieur</h3><div class="meta">victoires · nuls · défaites</div></div>
      <div style="padding:18px 20px;display:grid;grid-template-columns:1fr 1fr;gap:18px">
        ${domBars}
        ${extBars}
      </div>
    </div>`;
}
function barStats(side, label) {
  const total = Math.max((side?.matchs || 0), 1);
  const v = Math.round(((side?.victoires || 0) / total) * 100);
  const n = Math.round(((side?.nuls || 0) / total) * 100);
  const de = Math.max(0, 100 - v - n);
  return `
    <div>
      <div class="dl-label">${label} <span>${side?.matchs || 0} matchs · ${side?.buts || 0} buts</span></div>
      <div class="dl-bars">
        <div class="dl-row"><span>V</span><div class="dl-track"><div class="dl-fill v" style="width:${v}%"></div></div><b>${side?.victoires || 0}</b></div>
        <div class="dl-row"><span>N</span><div class="dl-track"><div class="dl-fill n" style="width:${n}%"></div></div><b>${side?.nuls || 0}</b></div>
        <div class="dl-row"><span>D</span><div class="dl-track"><div class="dl-fill de" style="width:${de}%"></div></div><b>${side?.defaites || 0}</b></div>
      </div>
    </div>`;
}

/* ---------------- Calendrier interactif ---------------- */
function buildCalendrier(d) {
  const next = d.prochainMatch;
  const rows = (d.calendrier || []).slice();
  let html = '';

  if (next) {
    const lieu = next.lieu || 'Salon-de-Provence';
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(lieu)}`;
    const ics = makeICS(next);
    const icsData = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    html += `
      <div class="glass-in next-card">
        <div class="card-head"><h3>📅 Prochain match — ${esc(next.journee || '')}</h3>
          <span class="badge"><span class="dot"></span> LIVE</span></div>
        <div style="padding:18px 20px">
          <div class="versus">
            <div class="vs-team"><div class="vs-crest">SB</div><b>${esc(next.domicile)}</b></div>
            <div class="vs-mid"><div class="vs-score">VS</div><div class="vs-date">${esc(dateLongue(next.date))}</div></div>
            <div class="vs-team"><div class="vs-crest dim">?</div><b>${esc(next.exterieur)}</b></div>
          </div>
          <div class="cd-box" id="cdBox"></div>
          <div id="wdBox" style="text-align:center;margin-top:8px"></div>
          <div class="vs-actions">
            <a class="btn btn-ghost" target="_blank" rel="noopener" href="${mapsUrl}">📍 S'y rendre</a>
            <a class="btn btn-ghost" href="${icsData}" download="match-salon-bel-air.ics">📆 Calendrier</a>
          </div>
        </div>
      </div>`;
  }

  html += `<div class="glass-in" style="margin-top:16px">
    <div class="card-head"><h3>🗓️ Toutes les journées</h3><div class="meta">dates officielles FFF</div></div>
    <div class="cal-list">`;
  for (const j of rows) {
    let tag;
    if (j.joue && j.score) tag = '<span class="cal-tag done">Joué</span>';
    else if (j.passe) tag = '<span class="cal-tag done">Passé</span>';
    else tag = '<span class="cal-tag up">À venir</span>';

    const meu = j.adversaire || '<span style="color:var(--muted)">adversaire à venir</span>';
    const dom = j.domicile ? '<b>Salon Bel Air</b>' : esc(meu);
    const adv = j.domicile ? esc(meu) : '<b>Salon Bel Air</b>';

    html += `<div class="cal-row">
      <div><div class="cal-j">${esc(j.journee)}</div><div class="cal-date">${dateCourte(j.date)}</div></div>
      <div class="cal-match"><span>${dom}</span> <span class="vs">vs</span> <span>${adv}</span></div>
      ${j.score ? `<span class="cal-score">${esc(j.score)}</span>` : ''}
      ${tag}
    </div>`;
  }
  html += '</div></div>';
  return html;
}

function makeICS(m) {
  const dt = new Date(m.date);
  const iso = dt.toISOString().replace(/[-:]/g, '').split('.')[0].replace(/Z$/, '');
  const end = new Date(dt.getTime() + 2 * 3600 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0].replace(/Z$/, '');
  const sum = `Salon Bel Air vs ${m.exterieur || '?'}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SBA//BelAir//FR',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@salon-bel-air`,
    `DTSTAMP:${iso}`,
    `DTSTART:${iso}`, `DTEND:${end}`,
    `SUMMARY:${sum}`,
    `DESCRIPTION:${m.journee || ''} - ${m.lieu || 'Salon-de-Provence'}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

/* ---------------- Équipe / effectif ---------------- */
async function buildEquipe(d, cat) {
  let joueurs = [];
  try {
    const jf = cat.id + '-joueurs.json';
    const jd = await getJSON('./data/' + jf);
    joueurs = jd.joueurs || [];
  } catch (_) { /* pas de fichier joueurs */ }

  let squadHtml = `<div class="squad-note">L'effectif est extrait des feuilles de match officielles FFF (composition). Les buts/passes sont à compléter par le staff dans <code>data/${cat.id}-joueurs.json</code>.</div>`;
  if (joueurs.length) {
    const tri = joueurs.slice().sort((a, b) => (b.buts || 0) - (a.buts || 0));
    const top = tri[0]?.buts || 0;
    squadHtml = `<div class="player-grid">` + joueurs.map((p) => `
      <div class="player${p.buts === top && p.buts > 0 ? ' top' : ''}">
        <div class="num">${esc(p.numero ?? '—')}</div>
        <div class="pname">${esc(p.nom)}<div class="ppost">${esc(p.poste || 'Joueur')} · ${p.matchsJoues || 0} match${(p.matchsJoues || 0) > 1 ? 's' : ''}</div></div>
        <div class="pstats"><b>${p.buts || 0}</b><span>buts</span></div>
        <div class="pstats"><b>${p.passes || 0}</b><span>passes</span></div>
      </div>`).join('') + `</div>`;
    if (top > 0) {
      squadHtml += `<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">` +
        tri.filter((p) => p.buts > 0).slice(0, 3).map((p) =>
          `<span class="top-scorer">🥇 ${esc(p.nom)} · ${p.buts} ⚽</span>`).join('') + `</div>`;
    }
  }

  return `
    <div class="glass-in">
      <div class="card-head"><h3>👥 Effectif ${cat.libelle}</h3><div class="meta">${joueurs.length} joueurs détectés</div></div>
      <div style="padding:18px 20px">${squadHtml}</div>
    </div>`;
}

/* ---------------- Bientôt ---------------- */
function renderBientot(app, route) {
  const map = { u17: 'U17', u14: 'U14' };
  app.innerHTML = `
    <section class="hero">
      <h2><em>${map[route] || route.toUpperCase()}</em> — bientôt</h2>
      <p>Cette catégorie n'est pas encore ouverte sur la plateforme.<br>
      Dès que l'équipe est engagée, le club l'active en 2 minutes (il suffit de fournir le lien FFF).</p>
      <div class="hero-cta"><a href="#/" class="btn btn-primary">← Retour à l'accueil</a></div>
    </section>`;
}

/* ---------------- Stats globales / calendrier global ---------------- */
async function renderStatsGlobale(app) {
  const club = clubConfig || (clubConfig = await getJSON(CLUB_FILE));
  const cats = [];
  for (const c of club.categories.filter((c) => c.actif && c.fichier)) {
    try { cats.push(await getJSON(c.fichier)); } catch (_) { /* ignore */ }
  }
  app.innerHTML = `<section class="hero"><h2>Stats — <em>toutes équipes</em></h2>
    <p>Synthèse des catégories actives.</p></section>
    <div class="stats-global">` +
    cats.map((d) => {
      const s = d.stats || {};
      const sba = (d.classement || []).find((r) => r.isBelAir) || {};
      return `<a class="glass-in sg-card" href="#/${(d.libelle || 'u16').toLowerCase()}">
        <div class="sg-head">${d.libelle || '?'} <span class="pill">${d.poule || ''}</span></div>
        <div class="sg-pos">Position <b>${sba.pos || '—'}</b><small>/ ${(d.classement || []).length}</small></div>
        <div class="sg-grid">
          <div><b>${s.moyenneMarques ?? 0}</b><span>buts/match</span></div>
          <div><b>${s.cleanSheetsPct ?? 0}%</b><span>clean sheets</span></div>
          <div><b>${s.serie?.length || 0}</b><span>matchs</span></div>
        </div>
      </a>`;
    }).join('') + `</div>`;
}

async function renderCalendarGlobal(app) {
  const club = clubConfig || (clubConfig = await getJSON(CLUB_FILE));
  const cats = [];
  for (const c of club.categories.filter((c) => c.actif && c.fichier)) {
    try { cats.push({ cat: c, data: await getJSON(c.fichier) }); } catch (_) { /* ignore */ }
  }
  let html = `<section class="hero"><h2>Calendrier — <em>toutes équipes</em></h2></section>`;
  for (const { cat, data } of cats) {
    const rows = data.calendrier || [];
    const next = data.prochainMatch;
    html += `<div class="glass-in" style="margin-top:16px">
      <div class="card-head"><h3>${cat.libelle} — Calendrier</h3>
        ${next ? `<div class="meta">prochain : ${esc(next.journee || '')} · ${esc(dateCourte(next.date))}</div>` : ''}</div>
      <div class="cal-list">`;
    for (const j of rows.slice(0, 8)) {
      let tag = j.joue && j.score ? '<span class="cal-tag done">Joué</span>'
        : j.passe ? '<span class="cal-tag done">Passé</span>' : '<span class="cal-tag up">À venir</span>';
      const adv = j.adversaire || '—';
      html += `<div class="cal-row">
        <div><div class="cal-j">${esc(j.journee)}</div><div class="cal-date">${dateCourte(j.date)}</div></div>
        <div class="cal-match"><span>${j.domicile ? '<b>SB</b>' : esc(adv)}</span> <span class="vs">vs</span> <span>${j.domicile ? esc(adv) : '<b>SB</b>'}</span></div>
        ${j.score ? `<span class="cal-score">${esc(j.score)}</span>` : ''}${tag}
      </div>`;
    }
    html += '</div></div>';
  }
  app.innerHTML = html;
}

/* =====================================================================
 *  INIT
 * ===================================================================== */
window.addEventListener('hashchange', router);
document.addEventListener('click', (e) => {
  const dd = document.querySelector('.dropdown');
  if (dd && !e.target.closest('.dropdown')) dd.classList.remove('open');
});
el('catBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.querySelector('.dropdown')?.classList.toggle('open');
});

(async () => {
  clubConfig = await getJSON(CLUB_FILE);
  await router();
})();