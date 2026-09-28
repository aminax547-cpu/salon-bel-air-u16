#!/usr/bin/env node
/**
 * fetch-fff.mjs — Récupère automatiquement les classements des équipes jeunes de
 * Salon Bel Air Foot (District Provence) depuis les données publiques de la FFF
 * (epreuves.fff.fr) et génère `data/<cat>.json`.
 *
 * Stratégie : le site epreuves.fff.fr est une SPA Angular avec SSR.
 * - L'API JSON directe (/api/data/...) est protégée par un WAF (403) qui accepte
 *   seulement les requêtes "navigateur" (headers complets) — et encore, pas toujours.
 * - En revanche, la PAGE HTML rendue côté serveur (SSR) contient TOUT le classement
 *   embarqué dans le JSON `#ng-state` (Angular TransferState).
 * → On fetch la page HTML avec un User-Agent navigateur réaliste, on parse le
 *   `#ng-state`, et on en extrait les données officielles.
 *
 * Multi-catégories : on passe la catégorie en argument (voir CATS ci-dessous).
 *   node tools/fetch-fff.mjs --cat u16    → data/u16.json
 *   node tools/fetch-fff.mjs --cat u19    → data/u19.json
 * Pour activer une autre équipe (U14/U17...) : l'ajouter dans CATS avec son cpNo FFF.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Config — une entrée par catégorie (ajouter ici pour activer une équipe)
// ---------------------------------------------------------------------------
const CATS = {
  u16: {
    cpNo: '457249', // U16 Départemental 2 — POULE A — saison 2026/27
    slug: 'u16-departemental-2',
    nom: 'U16 Départemental 2 — District Provence — 2026/27',
    libelle: 'U16',
    groupe: 1,
    seedMatchIds: [79514105, 79514111, 79514115], // J1, J2, J3
    fichierJoueurs: 'u16-joueurs.json',
  },
  u19: {
    cpNo: '457242', // U19 Départemental 1 — POULE A — saison 2026/27
    slug: 'u19-departemental-1',
    nom: 'U19 Départemental 1 — District Provence — 2026/27',
    libelle: 'U19',
    groupe: 1,
    seedMatchIds: [], // à compléter au premier run (scan automatique)
    fichierJoueurs: 'u19-joueurs.json',
  },
};

const argIdx = process.argv.indexOf('--cat');
const CAT_KEY = argIdx !== -1 ? process.argv[argIdx + 1] || 'u16' : 'u16';
const CAT = CATS[CAT_KEY];
if (!CAT) {
  console.error(`Catégorie inconnue : ${CAT_KEY}. Disponibles : ${Object.keys(CATS).join(', ')}`);
  process.exit(1);
}

const CPNO = process.env.FFF_CPNO || CAT.cpNo;
const PHASE = 1;
const GROUP = CAT.groupe;
const COMPETITION_SLUG = CAT.slug;
const NOM_COMPETITION = CAT.nom;
const CLUB_CIBLE = 'SALON BEL AIR FOOT';
const OUT = join(ROOT, 'data', `${CAT_KEY}.json`);
const JOUEURS_OUT = join(ROOT, 'data', CAT.fichierJoueurs);

// Graine d'IDs de matchs de Salon Bel Air déjà identifiés (feuilles de match).
// Le scan séquentiel complète automatiquement les journées ultérieures.
const SEED_MATCH_IDS = CAT.seedMatchIds;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function browsersHeaders(referer) {
  return {
    'User-Agent': UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Sec-CH-UA': '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...(referer ? { Referer: referer } : {}),
  };
}

// ---------------------------------------------------------------------------
// Récupération de la page SSR + extraction du ng-state
// ---------------------------------------------------------------------------
async function fetchPage(url, referer) {
  const res = await fetch(url, { headers: browsersHeaders(referer) });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  return await res.text();
}

function extractNgState(html) {
  const m = html.match(/<script[^>]*id="ng-state"[^>]*>\s*(.*?)\s*<\/script>/s);
  if (!m) throw new Error('ng-state introuvable dans la page');
  // décoder les entités HTML puis parser le JSON
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return JSON.parse(decoded);
}

function stateValue(ngState, urlSuffix) {
  const key = Object.keys(ngState).find((k) => k.includes(urlSuffix));
  if (!key) return null;
  const entry = ngState[key];
  return entry && typeof entry === 'object' && 'body' in entry ? entry.body : entry;
}

// ---------------------------------------------------------------------------
// Parsing classement + matchs
// ---------------------------------------------------------------------------
function num(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseClassement(body) {
  const member = body?.['hydra:member'] || [];
  if (!member.length) return null;
  // le membre le plus récent = dernière journée (ordre descendant côté API,
  // on prend celui qui a le plus de matchs joués pour être sûr)
  let best = member[0];
  let bestPlayed = -1;
  for (const it of member) {
    const rows = it?.donneesFormatees || [];
    const played = Math.max(...rows.map((r) => num(r.nbMatch)), 0);
    if (played >= bestPlayed) {
      bestPlayed = played;
      best = it;
    }
  }
  return {
    journeeId: best.id,
    rows: (best.donneesFormatees || []).map((r) => ({
      pos: num(r.placeAffichage),
      club: (r.nomEquipe || '').trim(),
      pts: r.points === 'EX' || r.points === 'EXC' ? r.points : num(r.points),
      j: num(r.nbMatch),
      g: num(r.nbMatchGagne),
      n: num(r.nbMatchNul),
      p: num(r.nbMatchPe),
      bp: num(r.nbButPour),
      bc: num(r.nbButContre),
      diff: num(r.diffBut),
      evo: r.evolutionClassement ?? null, // +1/-1/0
      serie: Array.isArray(r.serieEnCours) ? r.serieEnCours : [],
      clCod: r.clCod ?? null,
    })),
  };
}

/**
 * Récupère la composition + les infos du match FFF depuis sa page HTML SSR.
 * @returns {{ joueurs: Array, adversaire: string|null, score: string|null, joue: boolean, journee: number|null, domicile: boolean|null }}
 */
async function fetchMatchSquad(matchId, clubCible) {
  try {
    const url = `https://epreuves.fff.fr/competition/match/${matchId}`;
    const html = await fetchPage(url);
    const state = extractNgState(html);
    const body = stateValue(state, `/matches/${matchId}`);
    if (!body) return { joueurs: [], adversaire: null, score: null, joue: false, journee: null, domicile: null, stade: null, gps: null, heure: null, statut: null };
    const df = body.donneesFormatees || body;
    const joueurs = [];
    let adversaire = null, domicile = null;
    for (const side of ['recevant', 'visiteur']) {
      const adv = df[side] || {};
      const club = (adv.club || {}).nom || '';
      const estCible = club.toUpperCase().includes(clubCible.toUpperCase());
      if (estCible) {
        domicile = side === 'recevant';
        for (const p of adv.composition || []) {
          joueurs.push({
            inNo: p.inNo ?? null,
            maillot: p.maillot ?? null,
            prenom: (p.prenom || '').trim(),
            nom: (p.nom || '').trim(),
            type: p.type === 'remplacant' ? 'remplaçant' : 'titulaire',
            momentsForts: p.momentsForts || [],
          });
        }
      } else if (club) {
        adversaire = club;
      }
    }
    const joue = !!df.joue;
    const score =
      joue && df.recevant?.buts != null && df.visiteur?.buts != null
        ? `${df.recevant.buts} — ${df.visiteur.buts}`
        : null;
    // SBA joue-t-elle réellement dans ce match ?
    const sbaEnJeu = joueurs.length > 0 || (df.recevant?.club?.nom || '').toUpperCase().includes(clubCible.toUpperCase()) || (df.visiteur?.club?.nom || '').toUpperCase().includes(clubCible.toUpperCase());

    // stade + GPS (brief : lieu + coordonnées) — le champ FFF est "long", pas "lon"
    const stadeObj = df.stade || {};
    const stade = stadeObj.nom || null;
    const adresseStade = Array.isArray(stadeObj.adresse) ? stadeObj.adresse.join(', ') : '';
    const latSt = stadeObj.lat != null ? String(stadeObj.lat) : null;
    const lonSt = stadeObj.long != null ? String(stadeObj.long) : (stadeObj.lon != null ? String(stadeObj.lon) : null);
    const gps = latSt && lonSt ? `${latSt},${lonSt}` : null;

    // heure de coup d'envoi (heure locale)
    let heure = null;
    if (df.date) {
      try {
        heure = new Date(df.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      } catch (_) { /* ignore */ }
    }

    return {
      joueurs,
      adversaire,
      score,
      joue,
      journee: sbaEnJeu && df.journee?.pjNo != null ? num(df.journee.pjNo) : null,
      domicile,
      stade: stade || adresseStade || null,
      gps,
      heure,
      statut: df.maStatutLib || (joue ? 'joué' : 'à venir'),
    };
  } catch (e) {
    console.warn(`  (match ${matchId} indisponible : ${e.message})`);
    return { joueurs: [], adversaire: null, score: null, joue: false, journee: null, domicile: null, stade: null, gps: null, heure: null, statut: null };
  }
}

/** Compile l'effectif de façon incrémentale : charge l'effectif précédent,
 *  applique les nouvelles feuilles de match par-dessus et préserve buts/passes.
 *  @param {Array<{matchId:number, joueurs:Array}>} nouveauxMatchs
 *  @param {Set<number>} matchIdsDejaTraites
 */
function compileSquad(nouveauxMatchs, matchIdsDejaTraites) {
  const prevFile = JOUEURS_OUT;
  let prev = { joueurs: [], sourceMatchIds: matchIdsDejaTraites ? [...matchIdsDejaTraites] : [] };
  if (existsSync(prevFile)) {
    try { prev = JSON.parse(readFileSync(prevFile, 'utf-8')); } catch (_) { /* ignore */ }
  }

  // base : effectif existant (buts/passes préservés)
  const map = new Map();
  for (const j of prev.joueurs || []) {
    const nom = (j.nom || '').trim();
    const key = `${j.numero ?? ''}|${nom}`;
    map.set(key, {
      numero: j.numero,
      nom,
      poste: j.poste || 'Effectif',
      matchsJoues: j.matchsJoues ?? 0,
      titularisations: j.titularisations ?? 0,
      remplacements: j.remplacements ?? 0,
      cartonsJaunes: j.cartonsJaunes ?? 0,
      cartonsRouges: j.cartonsRouges ?? 0,
      cartons: j.cartons ?? ((j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0)),
      buts: j.buts ?? 0,
      passes: j.passes ?? 0,
    });
  }

  // appliquer les nouvelles feuilles de match (incrément)
  for (const { joueurs } of nouveauxMatchs) {
    for (const p of joueurs) {
      const nomComplet = `${p.prenom} ${p.nom}`.trim() || '—';
      const key = `${p.maillot ?? ''}|${nomComplet}`;
      const cur = map.get(key) || {
        numero: p.maillot, nom: nomComplet, poste: 'Effectif',
        matchsJoues: 0, titularisations: 0, remplacements: 0,
        cartonsJaunes: 0, cartonsRouges: 0, cartons: 0,
        buts: 0, passes: 0,
      };
      cur.matchsJoues += 1;
      if (p.type === 'titulaire') cur.titularisations += 1;
      else cur.remplacements += 1;
      const j = (p.momentsForts || []).filter((m) => m === 'carton-jaune').length;
      const r = (p.momentsForts || []).filter((m) => m === 'carton-rouge').length;
      cur.cartonsJaunes += j;
      cur.cartonsRouges += r;
      cur.cartons += j + r;
      if (cur.numero == null) cur.numero = p.maillot;
      map.set(key, cur);
    }
  }

  const effectif = [...map.values()]
    .sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99) || a.nom.localeCompare(b.nom))
    .map((p) => ({
      numero: p.numero,
      nom: p.nom,
      poste: p.titularisations > 0 && p.remplacements === 0 ? 'Titulaire' : (p.remplacements > 0 ? 'Remplaçant / titulaire' : p.poste || 'Effectif'),
      matchsJoues: p.matchsJoues,
      titularisations: p.titularisations,
      remplacements: p.remplacements,
      cartonsJaunes: p.cartonsJaunes,
      cartonsRouges: p.cartonsRouges,
      cartons: p.cartons,
      buts: p.buts,
      passes: p.passes,
    }));

  const sourceMatchIds = [...new Set([...(prev.sourceMatchIds || []), ...nouveauxMatchs.map((m) => m.matchId)])];
  return { effectif, sourceMatchIds };
}

function parseMatchs(body) {
  const member = body?.['hydra:member'] || [];
  return member
    .map((m) => {
      const df = m?.donneesFormatees || m || {};
      const recevant = df.recevant || {};
      const visiteur = df.visiteur || {};
      const club1 = recevant.club || {};
      const club2 = visiteur.club || {};
      return {
        maNo: df.maNo ?? m.id,
        date: df.date,
        journee: df.journee?.pjNo ?? null,
        statut: df.maStatutLib || (df.joue ? 'joué' : 'programmé'),
        joue: !!df.joue,
        recevant: { club: club1.nom || null, buts: recevant.buts ?? null, logo: club1.logo || null },
        visiteur: { club: club2.nom || null, buts: visiteur.buts ?? null, logo: club2.logo || null },
      };
    })
    .filter((x) => x.recevant.club || x.visiteur.club);
}

// repère le club cible dans un match (nom contient "SALON BEL AIR")
function isBelAirMatch(m) {
  const r = (m.recevant.club || '').toUpperCase();
  const v = (m.visiteur.club || '').toUpperCase();
  return r.includes('SALON BEL AIR') || v.includes('SALON BEL AIR');
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const wantPoule = process.argv.find((a) => a.startsWith('--poule'));
  const gpNo = wantPoule ? parseInt(wantPoule.split('=')[1] || 'B', 10) : GROUP;
  const pouleNom = gpNo === 2 ? 'POULE B' : 'POULE A';

  const baseUrl = `https://epreuves.fff.fr/competition/engagement/${CPNO}-${COMPETITION_SLUG}/phase/${PHASE}/${gpNo}`;

  console.log(`→ Récupération du classement FFF : ${NOM_COMPETITION} (${pouleNom})`);
  console.log(`  URL : ${baseUrl}`);

  // 1. page principale : classement + journées
  const html = await fetchPage(baseUrl);
  const state = extractNgState(html);

  const classBody = stateValue(state, `/classement_journees?cpNo=${CPNO}&phNo=${PHASE}&gpNo=${gpNo}`);
  const compBody = stateValue(state, `/competitions/${CPNO}`);

  if (!classBody) throw new Error('classement introuvable dans le ng-state');

  const classement = parseClassement(classBody);
  if (!classement) throw new Error('classement vide');

  // 2. infos compétition (libellé poule / journées)
  let journees = [];
  let pouleNomOfficiel = pouleNom;
  const compDetail = compBody?.donneesFormatees || compBody;
  if (compDetail?.phases) {
    for (const ph of compDetail.phases) {
      for (const g of ph.groupes || []) {
        if (num(g.gpNo) === gpNo) {
          pouleNomOfficiel = g.nom || pouleNom;
          journees = (g.journees || []).map((j) => ({
            pjNo: num(j.pjNo),
            date: j.date,
          }));
        }
      }
    }
  }
  let matchs = [];
  for (const k of Object.keys(state)) {
    if (k.includes(`/matches?cpNo=${CPNO}`)) {
      matchs = matchs.concat(parseMatchs(stateValue(state, k.split('|').pop())) || []);
    }
  }
  // dédupliquer par maNo
  const seen = new Set();
  matchs = matchs.filter((m) => (seen.has(m.maNo) ? false : (seen.add(m.maNo), true)));

  // 3quater. Effectif : récupération des feuilles de match (compositions) des
  // journées jouées. Les IDs de matchs FFF sont consécutifs par journée ; on
  // collecte ceux de SBA (déjà connus) puis on scanne la plage entre min et max
  // connus pour les journées jouées manquantes (borné → évite le rate-limit).
  console.log('→ Récupération des feuilles de match (effectif)…');
  const matchIdsConnus = [...SEED_MATCH_IDS, ...matchs.filter(isBelAirMatch).map((m) => m.maNo).filter(Boolean)];
  const journeesJouees = journees.filter((j) => new Date(j.date) < new Date(Date.now() - 12 * 3600 * 1000));
  const matchIdsCibles = new Set(matchIdsConnus);
  const attente = (ms) => new Promise((r) => setTimeout(r, ms));

  // IDs uniques connus par journée jouée
  const idsParJournee = new Map();
  for (const m of matchs.filter(isBelAirMatch)) {
    if (m.maNo && m.journee) {
      const cur = idsParJournee.get(m.journee) || [];
      cur.push(m.maNo);
      idsParJournee.set(m.journee, cur);
    }
  }
  // journées jouées sans match SBA connu → scanner entre min et max des IDs connus
  const joursSansMatch = journeesJouees.filter((j) => !idsParJournee.has(j.pjNo));
  if (joursSansMatch.length && matchIdsConnus.length) {
    const mini = Math.min(...matchIdsConnus);
    const maxi = Math.max(...matchIdsConnus);
    // on scanne la plage complète entre min et max (bornée) pour les matchs SBA
    for (let id = mini; id <= maxi; id++) {
      if (matchIdsCibles.has(id)) continue;
      const idNum = String(id);
      let ok = false;
      for (let essai = 0; essai < 2 && !ok; essai++) {
        try {
          const url = `https://epreuves.fff.fr/competition/match/${idNum}`;
          const html = await fetchPage(url);
          const state = extractNgState(html);
          const body = stateValue(state, `/matches/${idNum}`);
          const df = body?.donneesFormatees || body || {};
          const rn = ((df.recevant?.club || {}).nom || '').toUpperCase();
          const vn = ((df.visiteur?.club || {}).nom || '').toUpperCase();
          const pj = df.journee?.pjNo ?? null;
          if ((rn.includes('SALON BEL AIR') || vn.includes('SALON BEL AIR')) && num(pj) > 0) {
            matchIdsCibles.add(id);
          }
          ok = true;
        } catch (_) {
          await attente(300); // 404 ou rate-limit : on retente une fois
        }
      }
      await attente(150); // politesse anti-rate-limit
    }
    console.log(`  (scan des matchs voyage ${mini}–${maxi})`);
  }
  const matchsAvecCompo = []; // { matchId, joueurs[] }
  const prevSquadFile = JOUEURS_OUT;
  let matchIdsTraites = new Set();
  if (existsSync(prevSquadFile)) {
    try {
      matchIdsTraites = new Set(JSON.parse(readFileSync(prevSquadFile, 'utf-8')).sourceMatchIds || []);
    } catch (_) { /* ignore */ }
  }
  let nouveaux = 0;
  const nouveauIds = [];
  const infosMatchsScan = new Map(); // pjNo -> {adversaire, score, joue, domicile, stade, gps, heure, statut, date}
  for (const id of matchIdsCibles) {
    if (matchIdsTraites.has(id)) continue; // déjà compté dans l'effectif existant
    const info = await fetchMatchSquad(id, 'SALON BEL AIR');
    if (info.joueurs.length || info.journee) {
      matchsAvecCompo.push({ matchId: id, joueurs: info.joueurs });
      nouveauIds.push(id);
      nouveaux++;
      if (info.journee) {
        infosMatchsScan.set(info.journee, {
          adversaire: info.adversaire,
          score: info.score,
          joue: info.joue,
          domicile: info.domicile,
          stade: info.stade,
          gps: info.gps,
          heure: info.heure,
          statut: info.statut,
        });
      }
      console.log(`  ✓ match ${id} → ${info.joueurs.length} joueurs (nouveau)`);
    }
    await attente(150);
  }
  const effectif = compileSquad(matchsAvecCompo, matchIdsTraites);

  // 3terbis. Rattrapage calendrier : pour les journées jouées dont l'adversaire
  // n'est ni dans le snapshot SSR ni dans le scan (matchs déjà traités les runs
  // précédents), on récupère les infos via les seed IDs connus.
  const snapshotPj = new Set(matchs.filter(isBelAirMatch).map((m) => num(m.journee)));
  for (const j of journees) {
    if (snapshotPj.has(j.pjNo) || infosMatchsScan.has(j.pjNo)) continue;
    const dateJ = new Date(j.date);
    if (dateJ > new Date(Date.now() - 12 * 3600 * 1000)) continue; // pas encore jouée
    // trouver un seed ID dont la journée correspond : on fetch et on vérifie
    for (const id of SEED_MATCH_IDS) {
      if (infosMatchsScan.has(j.pjNo)) break;
      const info = await fetchMatchSquad(id, 'SALON BEL AIR');
      if (info.journee === j.pjNo && info.adversaire) {
        infosMatchsScan.set(info.journee, {
          adversaire: info.adversaire,
          score: info.score,
          joue: info.joue,
          domicile: info.domicile,
          stade: info.stade,
          gps: info.gps,
          heure: info.heure,
          statut: info.statut,
        });
        console.log(`  ✓ infos match ${id} (${info.adversaire} ${info.score || ''})`);
      }
      await attente(150);
    }
  }

  // 3ter. MATCHS FUTURS — scan des journées à venir.
  // Les IDs de matchs FFF étant consécutifs par journée (6 matchs/journée, +6 en
  // général entre deux journées), on scanne les blocs suivant le dernier ID connu
  // (feuilles jouées + snapshot) jusqu'à trouver les matchs de SBA "à venir"
  // (date future, statut à venir) avec leur stade/GPS/heure (brief Module 3).
  console.log('→ Scan des prochains matchs (futurs)…');
  const derniereJourneeJouee = Math.max(0, ...[...infosMatchsScan.keys(), ...snapshotPj].filter((p) => Number.isFinite(p)));
  const idsConnusTous = [...matchIdsCibles, ...matchs.filter(isBelAirMatch).map((m) => m.maNo)].filter(Boolean);
  const maxIdConnu = idsConnusTous.length ? Math.max(...idsConnusTous) : 0;
  // on scanne jusqu'à ~14 IDs après le dernier connu (≈ 2-3 journées de matchs)
  const scanFin = maxIdConnu + 16;
  for (let id = maxIdConnu + 1; id <= scanFin; id++) {
    if (infosMatchsScan.size > 0 && id - maxIdConnu > 14) break;
    let info = null;
    for (let essai = 0; essai < 2 && !info; essai++) {
      info = await fetchMatchSquad(id, 'SALON BEL AIR');
      if (!info.journee) { info = null; await attente(250); }
    }
    if (info && info.journee) {
      if (info.journee > derniereJourneeJouee && info.adversaire) {
        if (!infosMatchsScan.has(info.journee)) {
          infosMatchsScan.set(info.journee, {
            adversaire: info.adversaire,
            score: info.score,
            joue: info.joue,
            domicile: info.domicile,
            stade: info.stade,
            gps: info.gps,
            heure: info.heure,
            statut: info.statut,
          });
          console.log(`  📅 match futur ${id} (J${info.journee}) : ${info.domicile ? 'SBA' : info.adversaire} vs ${info.domicile ? info.adversaire : 'SBA'} — ${info.heure} — ${info.stade || ''} ${info.gps ? `(${info.gps})` : ''}`);
        }
        // on a trouvé 2 journées futures complètes : stop le scan (économise le rate-limit)
        const nbFuturesTrouvees = [...infosMatchsScan.keys()].filter((p) => p > derniereJourneeJouee).length;
        if (nbFuturesTrouvees >= 2) break;
      }
    }
    await attente(150);
  }

  // 3ter. calendrier complet : journées officielles + matchs connus
  // Le site FFF ne charge que la semaine active en SSR ; on construit donc le
  // calendrier depuis les 22 journées officielles (dates fiables) et on greffe
  // les matchs réels dès qu'ils sont publiés (snapshot + scan des feuilles).
  const calendrier = journees
    .slice()
    .sort((a, b) => a.pjNo - b.pjNo)
    .map((j) => {
      // priorité 1 : infos du scan des feuilles de match (fiables, toutes journées)
      const scan = infosMatchsScan.get(j.pjNo);
      if (scan) {
        return {
          id: `match_j${j.pjNo}`,
          journee: `J${j.pjNo}`,
          date: j.date,
          heure: scan.heure,
          statut: scan.joue ? 'joue' : (scan.statut === 'à venir' ? 'a_venir' : (new Date(j.date) < new Date(Date.now() - 12 * 3600 * 1000) ? 'passe' : 'a_venir')),
          passe: new Date(j.date) < new Date(Date.now() - 12 * 3600 * 1000),
          joue: scan.joue,
          domicile: scan.domicile,
          exterieur: scan.adversaire,
          adversaire: scan.adversaire,
          score: scan.score,
          lieu: scan.stade,
          gps: scan.gps,
        };
      }
      // priorité 2 : snapshot du SSR (semaine active)
      const m = matchs.find((x) => isBelAirMatch(x) && num(x.journee) === j.pjNo);
      const now = new Date();
      const dateJ = new Date(j.date);
      return {
        id: `match_j${j.pjNo}`,
        journee: `J${j.pjNo}`,
        date: j.date,
        heure: m?.heure ?? null,
        statut: m ? (m.joue ? 'joue' : 'a_venir') : (dateJ < new Date(now.getTime() - 12 * 3600 * 1000) ? 'passe' : 'a_venir'),
        passe: dateJ < new Date(now.getTime() - 12 * 3600 * 1000),
        joue: m ? m.joue : false,
        domicile: m
          ? (m.recevant.club || '').toUpperCase().includes('SALON BEL AIR')
            ? true
            : false
          : null,
        exterieur: m
          ? (m.recevant.club || m.visiteur.club || '—').toUpperCase().includes('SALON BEL AIR')
            ? m.visiteur.club || m.recevant.club
            : m.recevant.club || m.visiteur.club
          : null,
        adversaire: m
          ? (m.recevant.club || m.visiteur.club || '—').toUpperCase().includes('SALON BEL AIR')
            ? m.visiteur.club || m.recevant.club
            : m.recevant.club || m.visiteur.club
          : null,
        score: m && m.recevant.buts !== null ? `${m.recevant.buts} — ${m.visiteur.buts}` : null,
        lieu: null,
        gps: null,
      };
    });

  const belAirMatchs = matchs.filter(isBelAirMatch).sort((a, b) => (a.date < b.date ? 1 : -1));
  const dernier = belAirMatchs.find((m) => m.joue && m.recevant.buts !== null);
  let prochain = belAirMatchs.find((m) => !m.joue);

  // le prochain match du scan futur (le plus tôt, date > maintenant)
  const futurs = [...infosMatchsScan.entries()]
    .map(([pj, info]) => ({ pj, info }))
    .filter((x) => !x.info.joue && x.info.adversaire)
    .sort((a, b) => a.pj - b.pj);
  const prochainFutur = futurs[0];

  // 3bis. Si le prochain match n'est pas encore publié (adversaires à venir),
  // on déduit la prochaine journée du calendrier officiel (date connue).
  if (!prochain && prochainFutur) {
    prochain = {
      pjNo: prochainFutur.pj,
      date: prochainFutur.info.date || journees.find((j) => j.pjNo === prochainFutur.pj)?.date || null,
      recevant: { club: prochainFutur.info.domicile ? 'Salon Bel Air Foot' : prochainFutur.info.adversaire },
      visiteur: { club: prochainFutur.info.domicile ? prochainFutur.info.adversaire : 'Salon Bel Air Foot' },
      lieu: prochainFutur.info.stade || 'Adresse à confirmer',
      gps: prochainFutur.info.gps,
      heure: prochainFutur.info.heure,
      aVenirCalendrier: false,
    };
  } else if (!prochain) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
    const upcoming = journees
      .map((j) => ({ ...j, dateObj: new Date(j.date) }))
      .filter((j) => j.dateObj >= tomorrow)
      .sort((a, b) => a.dateObj - b.dateObj);
    if (upcoming.length) {
      prochain = {
        pjNo: upcoming[0].pjNo,
        date: formatDate(upcoming[0].date),
        recevant: { club: 'Salon Bel Air Foot' },
        visiteur: { club: 'Adversaire à venir' },
        aVenirCalendrier: true,
      };
    }
  }
  // injecter date ISO complète + lieu/gps si présent
  if (prochain && !prochain.dateISO) {
    const jDate = (prochain.pjNo && journees.find((j) => j.pjNo === prochain.pjNo)) || null;
    if (jDate) prochain.dateISO = jDate.date;
  }

  // 4quater. Fusion mémoire : le WAF FFF est instable → si un run échoue à
  // retrouver un match futur déjà connu (lieu/gps/adversaire), on le conserve.
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf-8'));
      const prevCal = prev.calendrier || [];
      for (let i = 0; i < calendrier.length; i++) {
        const cur = calendrier[i];
        if (cur.statut === 'a_venir' && !cur.exterieur) {
          const old = prevCal.find((p) => p.journee === cur.journee && p.exterieur);
          if (old) calendrier[i] = { ...cur, ...old };
        }
      }
      // prochain match : si perdu par un run (adversaire à venir), on reprend l'ancien
      if (!prochain || !prochain.exterieur || prochain.exterieur === 'Adversaire à venir') {
        const oldNext = prev.prochainMatch;
        if (oldNext && oldNext.exterieur && oldNext.exterieur !== 'Adversaire à venir') {
          prochain = {
            pjNo: parseInt((oldNext.journee || '').replace('J', ''), 10) || null,
            date: oldNext.date,
            dateISO: oldNext.date,
            heure: oldNext.heure,
            recevant: { club: oldNext.domicile },
            visiteur: { club: oldNext.exterieur },
            lieu: oldNext.lieu,
            gps: oldNext.gps,
          };
        }
      }
    } catch (_) { /* ignore */ }
  }

  // 4. build du JSON
  const now = new Date();

  // 4bis. Statistiques "pro" calculées depuis le calendrier (matchs de SBA joués)
  const stats = (() => {
    const joues = calendrier.filter((c) => c.joue && c.score && c.adversaire);
    const forme = joues
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5)
      .map((c) => {
        const [d, e] = (c.score || '0-0').split('—').map((x) => parseInt(x, 10));
        const sba = c.domicile ? d : e;
        const adv = c.domicile ? e : d;
        return {
          journee: c.journee,
          adversaire: c.adversaire,
          domicile: c.domicile,
          score: c.score,
          resultat: sba > adv ? 'V' : sba === adv ? 'N' : 'D',
          marques: sba,
          encaisses: adv,
        };
      });
    const totalMarques = forme.reduce((a, m) => a + m.marques, 0);
    const totalEncaisses = forme.reduce((a, m) => a + m.encaisses, 0);
    const cleanSheets = forme.filter((m) => m.encaisses === 0).length;
    const dom = forme.filter((m) => m.domicile);
    const ext = forme.filter((m) => !m.domicile);
    return {
      matchsJoues: forme.length,
      forme,
      serie: forme.map((m) => m.resultat), // ['V','N','D',...] → badges 🟢🟠🔴
      cleanSheets: cleanSheets,
      cleanSheetsPct: forme.length ? Math.round((cleanSheets / forme.length) * 100) : 0,
      moyenneMarques: forme.length ? +(totalMarques / forme.length).toFixed(2) : 0,
      moyenneEncaisses: forme.length ? +(totalEncaisses / forme.length).toFixed(2) : 0,
      domicile: {
        matchs: dom.length,
        victoires: dom.filter((m) => m.resultat === 'V').length,
        nuls: dom.filter((m) => m.resultat === 'N').length,
        defaites: dom.filter((m) => m.resultat === 'D').length,
        buts: dom.reduce((a, m) => a + m.marques, 0),
      },
      exterieur: {
        matchs: ext.length,
        victoires: ext.filter((m) => m.resultat === 'V').length,
        nuls: ext.filter((m) => m.resultat === 'N').length,
        defaites: ext.filter((m) => m.resultat === 'D').length,
        buts: ext.reduce((a, m) => a + m.marques, 0),
      },
    };
  })();

  // 4ter. Fallback staff-input.json — le coach peut forcer/saisir les buts et passes
  // individuels (la FFF ne les publie pas pour les jeunes). Fusion par prénom+nom.
  const staffInput = join(ROOT, 'data', 'staff-input.json');
  let effectifFinal = effectif.effectif;
  if (existsSync(staffInput)) {
    try {
      const staff = JSON.parse(readFileSync(staffInput, 'utf-8'));
      if (Array.isArray(staff.joueurs)) {
        const staffMap = new Map();
        for (const j of staff.joueurs) {
          const cle = `${(j.prenom || '').toUpperCase()}|${(j.nom || '').toUpperCase()}`;
          staffMap.set(cle, j);
        }
        effectifFinal = effectif.effectif.map((p) => {
          const [prenom, ...rest] = (p.nom || '').split(' ');
          const nomJ = rest.join(' ');
          const cle = `${(prenom || '').toUpperCase()}|${(nomJ || '').toUpperCase()}`;
          const s = staffMap.get(cle);
          if (s) {
            return {
              ...p,
              buts: s.buts ?? p.buts ?? 0,
              passes: s.passes ?? p.passes ?? 0,
              poste: s.poste || p.poste,
            };
          }
          return p;
        });
        // joueurs supplémentaires présents dans staff mais pas dans les feuilles
        for (const s of staff.joueurs || []) {
          const dejaIn = effectifFinal.some((p) => {
            const [prenom, ...rest] = (p.nom || '').split(' ');
            return `${(prenom || '').toUpperCase()}|${(rest.join(' ') || '').toUpperCase()}` ===
              `${(s.prenom || '').toUpperCase()}|${(s.nom || '').toUpperCase()}`;
          });
          if (!dejaIn) {
            effectifFinal.push({
              numero: s.numero ?? null,
              nom: `${s.prenom || ''} ${s.nom || ''}`.trim(),
              poste: s.poste || 'Effectif',
              matchsJoues: s.matchs_joues ?? 0,
              titularisations: 0,
              remplacements: 0,
              cartonsJaunes: s.cartons_jaunes ?? 0,
              cartonsRouges: s.cartons_rouges ?? 0,
              cartons: (s.cartons_jaunes ?? 0) + (s.cartons_rouges ?? 0),
              buts: s.buts ?? 0,
              passes: s.passes ?? 0,
            });
          }
        }
        console.log(`  (staff-input.json appliqué : ${(staff.joueurs || []).length} joueurs gérés par le coach)`);
      }
    } catch (e) {
      console.warn('  staff-input.json invalide :', e.message);
    }
  }
  effectifFinal = effectifFinal.sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99) || a.nom.localeCompare(b.nom));

  const data = {
    competition: NOM_COMPETITION,
    poule: pouleNomOfficiel,
    source: 'FFF — epreuves.fff.fr (données officielles, SSR) + staff-input.json',
    competionId: CPNO,
    phase: PHASE,
    groupe: gpNo,
    libelle: CAT.libelle,
    updated: now.toISOString(),
    updatedLabel: now
      .toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    classement: classement.rows.map((r) => ({
      ...r,
      isBelAir: r.club.toUpperCase().includes('SALON BEL AIR'),
    })),
    prochainMatch: prochain
      ? {
          journee: prochain.pjNo
            ? `J${prochain.pjNo}`
            : prochain.journee
              ? `J${prochain.journee}`
              : null,
          date: prochain.dateISO || prochain.date,
          heure: prochain.heure || null,
          domicile: prochain.recevant.club,
          exterieur: prochain.visiteur.club,
          lieu: prochain.lieu || (prochain.aVenirCalendrier
            ? 'Calendrier officiel — adversaire publié prochainement'
            : 'À confirmer — Stade Marcel Roustan'),
          gps: prochain.gps || null,
        }
      : null,
    dernierResultat: dernier
      ? {
          journee: dernier.journee ? `J${dernier.journee}` : null,
          date: formatDate(dernier.date),
          domicile: dernier.recevant.club,
          exterieur: dernier.visiteur.club,
          score: `${dernier.recevant.buts} — ${dernier.visiteur.buts}`,
          victoire:
            (dernier.recevant.club || '').toUpperCase().includes('SALON BEL AIR')
              ? dernier.recevant.buts > dernier.visiteur.buts
              : dernier.visiteur.buts > dernier.recevant.buts,
        }
      : null,
    calendrier,
    stats,
    effectif: effectifFinal,
  };

  // Ne pas changer le timestamp si le classement n'a pas bougé (évite les commits inutiles)
  if (existsSync(OUT)) {
    try {
      const prev = JSON.parse(readFileSync(OUT, 'utf-8'));
      const sig = (d) => JSON.stringify(d.classement) + JSON.stringify(d.dernierResultat) + JSON.stringify(d.prochainMatch) + JSON.stringify(d.calendrier) + JSON.stringify(d.effectif) + JSON.stringify(d.stats);
      if (sig(prev) === sig(data)) {
        data.updated = prev.updated;
        data.updatedLabel = prev.updatedLabel;
      }
    } catch (_) { /* ignore */ }
  }

  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

  // 5. effectif joueurs (fichier séparé, édité par le club si besoin)
  const jot = JOUEURS_OUT;
  writeFileSync(
    jot,
    JSON.stringify(
      {
        equipe: `${NOM_COMPETITION} — Salon Bel Air Foot`,
        saison: '2026/27',
        note: 'Effectif auto-extrait des feuilles de match officielles FFF (composition, incrémenté à chaque journée). La FFF ne publie pas les buts individuels pour les catégories jeunes : champs buts/passes à compléter par le staff — préservés entre les mises à jour. git push = mise à jour.',
        sourceMatchIds: effectif.sourceMatchIds,
        joueurs: effectif.effectif,
      },
      null,
      2
    ) + '\n'
  );

  console.log(`\n✅ ${OUT}`);
  console.log(`   ${classement.rows.length} équipes · MAJ ${data.updatedLabel}`);
  if (dernier) console.log(`   Dernier résultat : ${dernier.recevant.club} ${dernier.recevant.buts}-${dernier.visiteur.buts} ${dernier.visiteur.club}`);
  if (prochain) console.log(`   Prochain match   : ${prochain.recevant.club} vs ${prochain.visiteur.club} (${formatDate(prochain.date)})`);
  console.log(`✅ ${jot}`);
  console.log(`   ${effectif.effectif.length} joueurs · ${effectif.sourceMatchIds.length} matchs traités · ${nouveaux} nouveau(x) match(s) ajouté(s)`);
}

main().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});