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
  // Fil d'actualité : uniquement des actus VÉRIFIÉES (aucune acta générique).
  // Le club peut publier de vraies actus dans data/club.json → actualites,
  // ou via le générateur IA (data/actus/) après validation du coach.
  const toutes = [...(club.actualites || [])]
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
      <div class="card-head"><h3>🗞️ Fil d'actualité du club</h3><div class="meta">résultats & infos vérifiées</div></div>
      <div class="actus">${actus || '<div class="status">Aucune actualité pour l&rsquo;instant — les résultats officiels s&rsquo;afficheront ici après chaque journée.</div>'}</div>
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
    else if (name === 'calendrier') {
      tabBox.innerHTML = skeletonPage();
      buildCalendrier(d, cat).then((html) => { tabBox.innerHTML = html; bindCountdown(); });
    }
    else if (name === 'equipe') {
      // on passe l'effectif (JSON principal + joueurs dédiés) au tri
      const joueurs = (d.effectif || []).slice();
      tabBox.innerHTML = buildEquipe(d, cat);
      bindSquadSorts(joueurs, tabBox);
    }
  }
  function bindCountdown() {
    if (window.__cdTarget) { refreshCountdown(); if (countdownTimer) clearInterval(countdownTimer); countdownTimer = setInterval(refreshCountdown, 1000); }
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
async function buildCalendrier(d, cat) {
  const next = d.prochainMatch;
  const rows = (d.calendrier || []).slice();
  let html = '';

  // feuilles de match (composition + événements) pour les compo déroulantes
  let feuilles = [];
  try {
    const fd = await getJSON('./data/feuilles_' + cat.id + '.json');
    if (Array.isArray(fd)) feuilles = fd;
  } catch (_) { /* pas de feuilles */ }
  const feuilleParJ = new Map(feuilles.map((f) => [f.journee, f]));

  // médias du club (photos/vidéos/liens affichés au clic sur le match)
  let medias = [];
  try {
    const md = await getJSON('./data/media.json');
    if (Array.isArray(md.medias)) medias = md.medias.filter((m) => m.cat === cat.id);
  } catch (_) { /* pas de médias */ }
  const mediasParJ = new Map();
  for (const m of medias) {
    const key = m.journee;
    if (!mediasParJ.has(key)) mediasParJ.set(key, []);
    mediasParJ.get(key).push(m);
  }
  function galerieHTML(journee) {
    const list = mediasParJ.get(journee) || [];
    if (!list.length) return '';
    return `
      <div class="media-box">
        <h5>📸 Photos & vidéos</h5>
        <div class="media-grid">${list.map((m, i) => mediaThumb(m, i)).join('')}</div>
      </div>`;
  }

  if (next) {
    const mapsQuery = next.gps || next.lieu || 'Salon-de-Provence';
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`;
    const ics = makeICS(next);
    const icsData = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    html += `
      <div class="glass-in next-card">
        <div class="card-head"><h3>📅 Prochain match — ${esc(next.journee || '')}</h3>
          <span class="badge"><span class="dot"></span> LIVE</span></div>
        <div style="padding:18px 20px">
          <div class="versus">
            <div class="vs-team"><div class="vs-crest">SB</div><b>${esc(next.domicile)}</b></div>
            <div class="vs-mid"><div class="vs-score">VS</div><div class="vs-date">${esc(dateLongue(next.date))}${next.heure ? ' · ' + esc(next.heure) : ''}</div></div>
            <div class="vs-team"><div class="vs-crest dim">?</div><b>${esc(next.exterieur)}</b></div>
          </div>
          ${next.lieu ? `<div style="text-align:center;color:var(--muted);font-size:.78rem">📍 ${esc(next.lieu)}</div>` : ''}
          <div class="cd-box" id="cdBox"></div>
          <div id="wdBox" style="text-align:center;margin-top:8px"></div>
          <div class="vs-actions">
            <a class="btn btn-ghost" target="_blank" rel="noopener" href="${mapsUrl}">📍 S'y rendre</a>
            <a class="btn btn-ghost" href="${icsData}" download="match-salon-bel-air.ics">📆 Calendrier</a>
          </div>
        </div>
      </div>`;
  }

  // Deux sections : matchs joués / prochains rendez-vous (brief §3A)
  const joues = rows.filter((j) => j.statut === 'joue' || (j.joue && j.score));
  const futurs = rows.filter((j) => j.statut === 'a_venir');

  if (futurs.length) {
    html += `<div class="glass-in" style="margin-top:16px">
      <div class="card-head"><h3>📅 Prochains rendez-vous</h3><div class="meta">${futurs.length} matchs à venir</div></div>
      <div class="cal-list">`;
    for (const j of futurs) {
      const mapsQuery = j.gps || j.lieu || 'Salon-de-Provence';
      const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`;
      const icsData = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(makeICS(j));
      const adv = j.domicile ? j.exterieur : j.adversaire;
      html += `<div class="cal-row future">
        <div><div class="cal-j">${esc(j.journee)}</div><div class="cal-date">${dateCourte(j.date)}${j.heure ? ' · ' + esc(j.heure) : ''}</div></div>
        <div class="cal-match"><span>${j.domicile ? '<b>Salon Bel Air</b>' : esc(j.exterieur || '?')}</span> <span class="vs">vs</span> <span>${j.domicile ? esc(j.exterieur || '?') : '<b>Salon Bel Air</b>'}</span>
          ${j.lieu ? `<small class="cal-lieu">📍 ${esc(j.lieu)}</small>` : ''}</div>
        <span class="cal-tag up">À venir</span>
        <span class="cal-actions">
          <a class="btn btn-ghost btn-xs" target="_blank" rel="noopener" href="${mapsUrl}">📍</a>
          <a class="btn btn-ghost btn-xs" href="${icsData}" download="match-${esc(j.journee)}.ics">📆</a>
        </span>
      </div>`;
    }
    html += '</div></div>';
  }

  if (joues.length) {
    html += `<div class="glass-in" style="margin-top:16px">
      <div class="card-head"><h3>🏁 Matchs joués</h3><div class="meta">${joues.length} matchs · cliquer pour voir la compo & les médias</div></div>
      <div class="cal-list">`;
    for (const j of joues) {
      const feuille = feuilleParJ.get(j.journee);
      const compoBlock = feuille ? compoHTML(feuille) : '';
      const galerie = galerieHTML(j.journee);
      const nbMedias = (mediasParJ.get(j.journee) || []).length;
      html += `<div class="cal-row joue" data-compo="${esc(j.journee)}" data-journee="${esc(j.journee)}">
        <div><div class="cal-j">${esc(j.journee)}</div><div class="cal-date">${dateCourte(j.date)}</div></div>
        <div class="cal-match"><span>${j.domicile ? '<b>Salon Bel Air</b>' : esc(j.exterieur || '?')}</span> <span class="vs">vs</span> <span>${j.domicile ? esc(j.exterieur || '?') : '<b>Salon Bel Air</b>'}</span>
          ${j.lieu ? `<small class="cal-lieu">📍 ${esc(j.lieu)}</small>` : ''}</div>
        ${j.score ? `<span class="cal-score">${esc(j.score)}</span>` : '<span class="cal-tag done">—</span>'}
        <span class="cal-tag done">Joué${nbMedias ? ' · 📸' : ''}</span>
      </div>
      ${(compoBlock || galerie) ? `<div class="compo-box" id="compo-${esc(j.journee)}" hidden data-journee="${esc(j.journee)}">${compoBlock}${galerie}</div>` : ''}`;
    }
    html += '</div></div>';
  }

  // Fallback si aucun match joué ni futur avec données
  if (!joues.length && !futurs.length) {
    html += `<div class="glass-in" style="margin-top:16px"><div class="card-head"><h3>🗓️ Calendrier officiel</h3></div>
      <div class="cal-list">`;
    for (const j of rows) {
      html += `<div class="cal-row">
        <div><div class="cal-j">${esc(j.journee)}</div><div class="cal-date">${dateCourte(j.date)}</div></div>
        <div class="cal-match"><span>Salon Bel Air</span> <span class="vs">vs</span> <span>${esc(j.adversaire || '—')}</span></div>
      </div>`;
    }
    html += '</div></div>';
  }

  // mémorise les médias du match pour les clics (lightbox)
  window.__mediasParJ = mediasParJ;
  setTimeout(() => bindMediaClicks(document.getElementById('tabContent')), 0);

  return html;
}

/* ---------------- Composition de match (feuille FFF) ---------------- */
function compoHTML(f) {
  const titulaires = (f.composition || []).filter((p) => p.type === 'titulaire');
  const remplacants = (f.composition || []).filter((p) => p.type !== 'titulaire');
  const ev = (f.evenements || []).filter((e) => e.sba);
  const evHTML = ev.map((e) => {
    if (e.type === 'remplacement') {
      return `<li>${e.minute}<span>’</span> 🔄 <b>${esc(e.entrant)}</b> entre ← sort ${esc(e.sortant)}</li>`;
    }
    if (e.type === 'carton-jaune') {
      return `<li>${e.minute}<span>’</span> 🟨 <b>${esc(e.joueur)}</b> averti</li>`;
    }
    if (e.type === 'carton-rouge') {
      return `<li>${e.minute}<span>’</span> 🟥 <b>${esc(e.joueur)}</b> expulsé</li>`;
    }
    if (e.type === 'but') {
      return `<li>${e.minute}<span>’</span> ⚽ BUT <b>${esc(e.joueur)}</b></li>`;
    }
    return '';
  }).join('');

  return `
    <div class="compo-grid">
      <div class="compo-side">
        <h5>XI Titulaires</h5>
        ${titulaires.map((p) => `<div class="compo-p"><span class="c-num">${esc(p.numero ?? '—')}</span> ${esc(p.prenom)} ${esc(p.nom)}</div>`).join('')}
        ${remplacants.length ? `
        <h5 style="margin-top:10px">Remplaçants</h5>
        ${remplacants.map((p) => `<div class="compo-p"><span class="c-num">${esc(p.numero ?? '—')}</span> ${esc(p.prenom)} ${esc(p.nom)}</div>`).join('')}` : ''}
      </div>
      ${evHTML ? `<div class="compo-side"><h5>⏱️ Événements ${esc(f.journee || '')}</h5><ul class="compo-ev">${evHTML}</ul></div>` : ''}
      ${!evHTML && !titulaires.length ? '<div class="status">Feuille indisponible.</div>' : ''}
    </div>`;
}

/* ---------------- Médias (photos/vidéos) du match ---------------- */
function youtubeID(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? m[1] : null;
}
function mediaThumb(m, i) {
  if (m.type === 'photo') {
    return `<div class="media-item photo" data-media="${i}" tabindex="0" role="button" aria-label="Agrandir la photo ${esc(m.caption || '')}">
      <img src="${esc(m.src)}" alt="${esc(m.caption || 'Photo du match')}" loading="lazy">
      ${m.caption ? `<span class="media-cap">${esc(m.caption)}</span>` : ''}
    </div>`;
  }
  if (m.type === 'video') {
    return `<div class="media-item video" data-media="${i}" tabindex="0" role="button">
      <video src="${esc(m.src)}" muted preload="metadata"></video>
      <span class="media-badge">▶ Vidéo</span>
      ${m.caption ? `<span class="media-cap">${esc(m.caption)}</span>` : ''}
    </div>`;
  }
  // lien externe (YouTube principalement)
  const yt = youtubeID(m.src);
  if (yt) {
    return `<a class="media-item link" data-media="${i}" href="#mediaclick-${i}" tabindex="0">
      <img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="Vidéo externe" loading="lazy">
      <span class="media-badge">▶ YouTube</span>
      ${m.caption ? `<span class="media-cap">${esc(m.caption)}</span>` : ''}
    </a>`;
  }
  return `<a class="media-item link" href="${esc(m.src)}" target="_blank" rel="noopener">🔗 Ouvrir le lien</a>`;
}

/* Lightbox plein écran : photos/vidéos du match, navigation flèches */
function openLightbox(medias, index) {
  const old = document.getElementById('mediaLightbox');
  if (old) old.remove();
  let cur = index;
  function render() {
    const m = medias[cur];
    const yt = m.type !== 'photo' && m.type !== 'video' ? youtubeID(m.src) : null;
    let content;
    if (m.type === 'photo') content = `<img src="${esc(m.src)}" alt="">`;
    else if (m.type === 'video') content = `<video src="${esc(m.src)}" controls autoplay></video>`;
    else if (yt) content = `<iframe src="https://www.youtube.com/embed/${yt}?autoplay=1" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    else content = `<a class="btn btn-primary" href="${esc(m.src)}" target="_blank" rel="noopener">Ouvrir le lien ↗</a>`;
    lb.innerHTML = `
      <div class="lb-back" data-lb="close"></div>
      <div class="lb-card">
        <button class="lb-close" data-lb="close">✕</button>
        <div class="lb-media">${content}</div>
        ${m.caption ? `<div class="lb-cap">${esc(m.caption)}</div>` : ''}
        <div class="lb-nav">
          <button class="btn btn-ghost" data-lb="prev">← Préc.</button>
          <span class="lb-counter">${cur + 1} / ${medias.length}</span>
          <button class="btn btn-ghost" data-lb="next">Suiv. →</button>
        </div>
      </div>`;
  }
  const lb = document.createElement('div');
  lb.id = 'mediaLightbox';
  lb.className = 'lightbox';
  lb.addEventListener('click', (e) => {
    const a = e.target.closest('[data-lb]');
    if (!a) return;
    const act = a.dataset.lb;
    if (act === 'close') lb.remove();
    else if (act === 'prev') cur = (cur - 1 + medias.length) % medias.length, render();
    else if (act === 'next') cur = (cur + 1) % medias.length, render();
  });
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') lb.remove();
    if (e.key === 'ArrowLeft') { cur = (cur - 1 + medias.length) % medias.length; render(); }
    if (e.key === 'ArrowRight') { cur = (cur + 1) % medias.length; render(); }
  });
  render();
  document.body.appendChild(lb);
}

function bindMediaClicks(container) {
  const mediasParJ = window.__mediasParJ || new Map();
  container.querySelectorAll('[data-media]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const j = el.dataset.journee || el.closest('[data-journee]')?.dataset.journee;
      const list = j ? mediasParJ.get(j) || [] : [];
      if (!list.length) return;
      const i = parseInt(el.dataset.media || '0', 10);
      // re-index : data-media renvoie à la position dans le groupe du match
      const rel = list.findIndex((m) => (m.type === 'photo' || m.type === 'video') ? (el.querySelector('img,video')?.src === m.src || el.dataset.media === String(list.indexOf(m))) : true);
      const idx = rel >= 0 ? rel : i;
      openLightbox(list, idx);
    });
  });
}

function makeICS(m) {
  const dt = new Date(m.date);
  if (Number.isNaN(dt.getTime())) return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';
  const iso = dt.toISOString().replace(/[-:]/g, '').split('.')[0].replace(/Z$/, '');
  const end = new Date(dt.getTime() + 2 * 3600 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0].replace(/Z$/, '');
  const sum = `Salon Bel Air vs ${m.exterieur || m.adversaire || '?'}`;
  const lieu = m.lieu || 'Salon-de-Provence';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SBA//BelAir//FR',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@salon-bel-air`,
    `DTSTAMP:${iso}`,
    `DTSTART:${iso}`, `DTEND:${end}`,
    `SUMMARY:${sum}`,
    `DESCRIPTION:${m.journee || ''} - ${lieu}`,
    m.gps ? `LOCATION:${lieu} (${m.gps})` : `LOCATION:${lieu}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

/* ---------------- Équipe / effectif (cartes Panini + tri) ---------------- */
function playerCard(p, rank) {
  const med = ['🥇', '🥈', '🥉'];
  const badge = rank < 3 && (p.buts || 0) > 0 ? med[rank] : '';
  return `
    <div class="p-card${rank < 3 && (p.buts || 0) > 0 ? ' top' : ''}">
      <div class="p-card-head">
        <div class="p-card-num">${esc(p.numero ?? '—')}</div>
        <div class="p-card-badge">${badge}</div>
      </div>
      <div class="p-card-body">
        <div class="p-card-avatar">${esc((p.nom || '?').charAt(0))}</div>
        <div class="p-card-name">${esc(p.nom)}</div>
        <div class="p-card-post">${esc(p.poste || 'Joueur')}</div>
      </div>
      <div class="p-card-stats">
        <div class="pc-stat"><b>${p.matchsJoues ?? 0}</b><span>Matchs</span></div>
        <div class="pc-stat"><b>${p.buts ?? 0}</b><span>Buts</span></div>
        <div class="pc-stat"><b>${p.passes ?? 0}</b><span>Passes</span></div>
      </div>
      <div class="p-card-foot">
        <span class="pj-jaune" title="Cartons jaunes">🟨 ${p.cartonsJaunes ?? 0}</span>
        <span class="pj-rouge" title="Cartons rouges">🟥 ${p.cartonsRouges ?? 0}</span>
        <span class="pj-tit" title="Titularisations">⚑ ${p.titularisations ?? 0}</span>
      </div>
    </div>`;
}

async function buildEquipe(d, cat) {
  // Source de vérité : stats_<cat>.json (calcul scientifique cumulé feuille par feuille)
  let joueurs = null;
  try {
    const sd = await getJSON('./data/stats_' + cat.id + '.json');
    if (Array.isArray(sd.effectif)) {
      joueurs = sd.effectif.map((j) => ({
        numero: j.numero ?? null,
        nom: j.nom,
        matchsJoues: j.matchs_joues ?? 0,
        buts: j.buts ?? 0,
        passes: j.passes ?? 0,
        cartonsJaunes: j.jaunes ?? 0,
        cartonsRouges: j.rouges ?? 0,
        titularisations: 0,
        remplacements: 0,
        poste: '',
      }));
    }
  } catch (_) { /* stats_<cat>.json absent : on garde le fallback */ }

  if (!joueurs) {
    try {
      const jf = cat.id + '-joueurs.json';
      const jd = await getJSON('./data/' + jf);
      joueurs = jd.joueurs || [];
    } catch (_) { /* pas de fichier joueurs */ }
  }
  // fallback final : l'effectif du JSON principal
  if (!joueurs?.length && d.effectif?.length) joueurs = d.effectif;

  const nb = joueurs?.length || 0;
  let body = `<div class="squad-note">📋 Effectif calculé feuille par feuille depuis les <b>compositions officielles FFF</b> (titulaires + entrants en jeu) et les événements (cartons). Les buts/passes, non publiés par la FFF pour les jeunes, sont saisis par le staff via <code>data/staff-input.json</code>.</div>`;

  if (nb) {
    body += `
      <div class="squad-tools">
        <span class="squad-count">${nb} joueurs</span>
        <div class="squad-sorts">
          <button class="btn btn-ghost btn-xs" data-sort="buts">⚽ Trier par buts</button>
          <button class="btn btn-ghost btn-xs" data-sort="matchs">📆 Trier par matchs</button>
          <button class="btn btn-ghost btn-xs" data-sort="nom">🔤 Alphabétique</button>
        </div>
      </div>
      <div class="player-grid" id="squadGrid">${joueurs.map((p, i) => playerCard(p, i)).join('')}</div>
      <div class="top-scorers" id="topScorers"></div>`;
  }

  return `
    <div class="glass-in">
      <div class="card-head"><h3>👥 Effectif ${cat.libelle}</h3><div class="meta">${nb} joueurs (cumul feuilles FFF)</div></div>
      <div style="padding:16px 18px 18px">${body}</div>
    </div>`;
}

/* Tri interactif de l'effectif (délégué, appelé après injection) */
function bindSquadSorts(joueurs, container) {
  const grid = container.querySelector('#squadGrid');
  if (!grid) return;
  const sorts = container.querySelectorAll('[data-sort]');
  sorts.forEach((btn) => btn.addEventListener('click', () => {
    const mode = btn.dataset.sort;
    let sorted;
    if (mode === 'buts') sorted = joueurs.slice().sort((a, b) => (b.buts || 0) - (a.buts || 0) || (b.passes || 0) - (a.passes || 0));
    else if (mode === 'matchs') sorted = joueurs.slice().sort((a, b) => (b.matchsJoues || 0) - (a.matchsJoues || 0));
    else sorted = joueurs.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    grid.innerHTML = sorted.map((p, i) => playerCard(p, i)).join('');
    // podium mis à jour
    const ts = container.querySelector('#topScorers');
    if (ts) {
      const top = sorted.filter((p) => p.buts > 0).slice(0, 3);
      ts.innerHTML = top.length
        ? top.map((p, i) => `<span class="top-scorer">${['🥇','🥈','🥉'][i]} ${esc(p.nom)} · ${p.buts} ⚽</span>`).join('')
        : '';
    }
  }));
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

  // toggle "Voir la compo" sur les matchs joués
  const row = e.target.closest?.('.cal-row.joue[data-compo]');
  if (row) {
    const j = row.dataset.compo;
    const box = document.getElementById('compo-' + j);
    if (box) box.hidden = !box.hidden;
    row.classList.toggle('open');
  }
});
el('catBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.querySelector('.dropdown')?.classList.toggle('open');
});

(async () => {
  clubConfig = await getJSON(CLUB_FILE);
  await router();
})();