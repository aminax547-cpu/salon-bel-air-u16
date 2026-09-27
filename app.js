/* =====================================================================
 * Salon Bel Air Foot — U16 D2 — app.js
 * 1) Chargement du classement (découplé de la 3D : toujours affiché)
 * 2) Ballon 3D réaliste (three.module.js chargé dynamiquement)
 * ===================================================================== */

/* ============================================================
 * PARTIE 1 — CLASSEMENT (fonctionne même si WebGL/Three échoue)
 * ============================================================ */

const CONF = {
  dataUrl: './data/u16-d2-2026-2027.json',
  clubMarqueur: 'SALON BEL AIR',
};

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function dateLongue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildTable(d) {
  const rows = (d.classement || []).slice().sort((a, b) => a.pos - b.pos);
  if (!rows.length) {
    return `<div class="status">Aucun classement disponible pour le moment.</div>`;
  }
  let html = `<table><thead><tr>
    <th>#</th><th>Équipe</th><th>Pts</th><th>J</th><th>G</th><th>N</th><th>P</th>
    <th>BP</th><th>BC</th><th>Diff</th><th>Série</th><th>Évo</th>
  </tr></thead><tbody>`;

  for (const t of rows) {
    const diff = t.diff ?? t.bp - t.bc;
    const diffCls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : '';
    const serie = (t.serie || []).map((s) => `<i class="${s}">${s}</i>`).join('');
    let evo = '';
    if (t.evo === 1) evo = '<td class="evo up">▲</td>';
    else if (t.evo === -1) evo = '<td class="evo down">▼</td>';
    else if (t.evo === 0) evo = '<td class="evo">—</td>';
    else evo = '<td class="evo">·</td>';

    html += `<tr class="${t.isBelAir ? 'is-belair' : ''}">
      <td class="pos">${t.pos}</td>
      <td class="team"><div class="team-inline"><span class="team-dot"></span><span>${esc(t.club)}${t.isBelAir ? ' ⭐' : ''}</span></div></td>
      <td class="pts">${esc(t.pts)}</td>
      <td>${t.j ?? 0}</td><td>${t.g ?? 0}</td><td>${t.n ?? 0}</td><td>${t.p ?? 0}</td>
      <td>${t.bp ?? 0}</td><td>${t.bc ?? 0}</td>
      <td class="diff ${diffCls}">${diff > 0 ? '+' : ''}${diff}</td>
      <td><span class="serie">${serie || '—'}</span></td>
      ${evo}
    </tr>`;
  }
  return html + '</tbody></table>';
}

function buildBand(d) {
  const next = d.prochainMatch;
  const last = d.dernierResultat;
  let html = '';
  if (last) {
    html += `<div class="mini">
      <h4>⚽ Dernier résultat — ${esc(last.journee || '')}</h4>
      <div class="scoreline">${esc(last.domicile)} <b>${esc(last.score)}</b> ${esc(last.exterieur)}</div>
      <div class="sub">📅 ${esc(dateLongue(last.date))} · ${
        last.victoire === true ? '<span style="color:var(--ok)">Victoire 🎉</span>'
        : last.victoire === false ? '<span style="color:var(--ko)">Défaite</span>'
        : 'Match nul'}</div>
    </div>`;
  }
  if (next) {
    html += `<div class="mini next">
      <h4>📅 Prochain match — ${esc(next.journee || '')}</h4>
      <div class="scoreline"><b>${esc(next.domicile)}</b> <span style="color:var(--gold)">vs</span> ${esc(next.exterieur)}</div>
      <div class="sub">🗓️ ${esc(dateLongue(next.date))} · ${esc(next.lieu || '')}</div>
    </div>`;
  }
  return html;
}

async function loadClassement() {
  const wrap = el('tableWrap');
  try {
    const res = await fetch(CONF.dataUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();

    el('updated').textContent = d.updatedLabel || d.updated || '—';
    el('pouleLabel').textContent = '— ' + (d.poule || 'District Provence');

    wrap.innerHTML = buildTable(d);
    const band = el('band');
    band.innerHTML = buildBand(d);

    const auto = document.createElement('span');
    auto.className = 'auto';
    auto.textContent = '🔄 auto FFF';
    auto.title = 'Classement synchronisé automatiquement depuis les données officielles FFF';
    el('sourceHint') && el('sourceHint').append(auto);
  } catch (e) {
    console.error('Classement :', e);
    el('updated').textContent = '—';
    wrap.innerHTML = `
      <div class="status">
        <div class="err">⚠️ Impossible de charger le classement (${esc(e.message)}).</div>
        <div style="margin-top:14px">
          <button class="btn btn-ghost" onclick="location.reload()">Réessayer</button>
        </div>
      </div>`;
  }
}

loadClassement();

/* ============================================================
 * PARTIE 2 — BALLON 3D RÉALISTE (three.module.js en local)
 * ============================================================ */

async function initScene() {
  let THREE;
  try {
    THREE = await import('./assets/three.module.js');
  } catch (e) {
    console.warn('Three.js indisponible — le site reste fonctionnel sans la 3D.', e);
    const c = document.getElementById('ball-canvas');
    if (c) c.remove();
    return;
  }

  const canvas = document.getElementById('ball-canvas');
  if (!canvas) return;

  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 8.6);
    camera.lookAt(0, 0, 0);

    /* ---------- Éclairage studio ---------- */
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
    key.position.set(6, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x3d6bff, 0.65);
    fill.position.set(-7, 2, -3);
    scene.add(fill);

    const rimGold = new THREE.DirectionalLight(0xc8a96a, 0.8);
    rimGold.position.set(-4, 4, -6);
    scene.add(rimGold);

    // petites lumières de "projecteurs de stade" autour du ballon
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      const pl = new THREE.PointLight(0xffe9c4, 14, 30, 1.8);
      pl.position.set(Math.cos(a) * 5.5, 4.6 + Math.sin(i * 2.1) * 0.8, Math.sin(a) * 5.5);
      scene.add(pl);
    }

    /* ---------- Textures du ballon ---------- */
    // Frisure réaliste : génère 2 canvas procéduraux (couleur panneaux + bump coutures)
    function panneauxCanvas(w, h, palette) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');

      // fond blanc cassé
      g.fillStyle = palette.base;
      g.fillRect(0, 0, w, h);

      // grain très léger (micro-texture du cuir)
      if (palette.grain) {
        for (let i = 0; i < 14000; i++) {
          const x = Math.random() * w, y = Math.random() * h;
          g.fillStyle = `rgba(${palette.grain},${0.02 + Math.random() * 0.03})`;
          g.fillRect(x, y, 1.2, 1.2);
        }
      }

      // Les 12 sommets d'un icosaèdre → centres des 12 pentagones noirs
      const phi = (1 + Math.sqrt(5)) / 2;
      const icosa = [
        [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
        [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
        [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
      ];
      const pts = icosa.map(([x, y, z]) => {
        const n = Math.hypot(x, y, z);
        return [x / n, y / n, z / n];
      });

      function latLon(p) {
        const [x, y, z] = p;
        const lat = Math.asin(Math.max(-1, Math.min(1, y)));
        const lon = Math.atan2(x, z); // -PI..PI
        return { lat, lon };
      }
      function toCanvas(p) {
        const { lat, lon } = latLon(p);
        const u = (lon + Math.PI) / (2 * Math.PI); // 0..1
        const v = 1 - (lat + Math.PI / 2) / Math.PI; // 0..1 → y=0 haut (v=1 pôle sud)
        return { x: u * w, y: v * h };
      }

      // rayon angulaire d'un pentagone (distance centre→sommet) ≈ 30°
      const R = 0.52; // en radians (~29.8°) : ajusté visuellement
      // orientation locale : base tangente (orthonormale) au sommet
      function drawPentagon(center, R, fillStyle, strokeStyle, lw) {
        const p = center;
        // repère tangent : axe nord (pôle) et axe est
        const ref = [0, 1, 0];
        let t1 = ref.map((v, i) => v - p[i] * (v * p[0] + v * p[1] + v * p[2]));
        let t2 = [p[1] * ref[2] - p[2] * ref[1], p[2] * ref[0] - p[0] * ref[2], p[0] * ref[1] - p[1] * ref[0]];
        // cross pour avoir une base orientée
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        // t1 perpendiculaire au centre ; t2 = centre × t1
        t2 = cross(p, t1);
        const n1 = Math.hypot(...t1), n2 = Math.hypot(...t2);
        t1 = t1.map((v) => v / n1); t2 = t2.map((v) => v / n2);

        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const ang = (i * 72 - 90) * Math.PI / 180; // pentagone pointe vers le haut localement
          const dir = [
            t1[0] * Math.cos(ang) + t2[0] * Math.sin(ang),
            t1[1] * Math.cos(ang) + t2[1] * Math.sin(ang),
            t1[2] * Math.cos(ang) + t2[2] * Math.sin(ang),
          ];
          // point sur la sphère : p*cos(R) + dir*sin(R)
          const sp = p.map((v, i) => v * Math.cos(R) + dir[i] * Math.sin(R));
          const { x, y } = toCanvas(sp);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath();
        if (fillStyle) { g.fillStyle = fillStyle; g.fill(); }
        if (strokeStyle) { g.strokeStyle = strokeStyle; g.lineWidth = lw || 3; g.stroke(); }
      }

      // 1) halo léger pour la profondeur
      // 2) pentagones noirs
      for (const p of pts) {
        drawPentagon(p, R, 'rgba(0,0,0,0.06)', null, 0); // halo léger
        if (palette.panel) {
          drawPentagon(p, R * 0.93, palette.panel, null, 0);
        }
      }
      // 3) coutures : lignes épaisses claires sur le contour des panneaux
      for (const p of pts) {
        drawPentagon(p, R, null, palette.stitch, palette.stitchLw || 2.5);
      }
      // 4) très léger zétaillage sombre sur les bords pour la profondeur
      for (const p of pts) {
        drawPentagon(p, R * 1.0, null, 'rgba(0,0,0,0.10)', 1.5);
      }

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    }

    // map (couleur)
    const colorTex = panneauxCanvas(2048, 1024, {
      base: '#f2efe6',
      grain: '120,110,90',
      panel: '#1b1b1f',
      stitch: '#ffffff',
      stitchLw: 4,
    });
    // bump (relief) : coutures en blanc = relief, panneaux en gris moyen
    const bumpTex = panneauxCanvas(2048, 1024, {
      base: '#777777',
      grain: null,
      panel: '#6a6a6a',
      stitch: '#f0f0f0',
      stitchLw: 5,
    });

    const geometry = new THREE.SphereGeometry(2.05, 128, 96);
    const material = new THREE.MeshPhysicalMaterial({
      map: colorTex,
      bumpMap: bumpTex,
      bumpScale: 0.06,
      roughness: 0.5,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      envMapIntensity: 1.0,
    });

    const ball = new THREE.Mesh(geometry, material);
    ball.castShadow = true;
    ball.receiveShadow = false;
    scene.add(ball);

    // ombre portée au sol
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 64),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -2.15;
    scene.add(shadow);

    // sol stylisé (reflet discret sous le ballon)
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      new THREE.MeshStandardMaterial({ color: 0x0a1628, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.35 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2.2;
    scene.add(ground);

    /* ---------- Particules "stade de nuit" ---------- */
    const dustCount = 260;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 22;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 12 + 1.5;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 22 - 4;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xc8a96a, size: 0.035, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    /* ---------- Interaction : rotation à la souris + rebond au clic ---------- */
    let rotX = 0.0, rotY = 0.0, targetRotX = 0.0, targetRotY = 0.0;
    let dragging = false, prevX = 0, prevY = 0;
    let bounce = 0, vel = 0;
    const baseY = 0;

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      prevX = e.clientX; prevY = e.clientY;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      prevX = e.clientX; prevY = e.clientY;
      targetRotY += dx * 0.008;
      targetRotX += dy * 0.006;
    });
    canvas.addEventListener('pointerup', (e) => {
      dragging = false;
      canvas.style.cursor = 'grab';
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    canvas.addEventListener('click', () => {
      if (bounce < 0.02) vel = 0.24; // rebond
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { vel = 0.24; e.preventDefault(); }
    });

    /* ---------- Resize ---------- */
    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    /* ---------- Boucle ---------- */
    const clock = new THREE.Clock();
    let t = 0;

    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt;

      // inertie douce vers la cible de rotation
      rotY += (targetRotY - rotY) * 0.08;
      rotX += (targetRotX - rotX) * 0.08;

      // rotation lente automatique quand on ne touche pas
      if (!dragging) {
        targetRotY += dt * 0.12;
      }

      // physique du rebond
      if (vel !== 0 || bounce > 0) {
        bounce += vel; vel -= 0.014;
        if (bounce < 0) { bounce = 0; vel *= -0.42; if (Math.abs(vel) < 0.005) vel = 0; }
      }

      ball.position.y = baseY + bounce * 1.35;
      ball.rotation.x = rotX;
      ball.rotation.y = rotY;
      const squash = Math.max(0.4, 1 - bounce * 0.18);
      ball.scale.set(squash, 1 + bounce * 0.22, squash);

      // ombre qui suit le rebond
      shadow.position.y = -2.15 + (baseY + bounce * 1.35) * 0.0;
      shadow.scale.setScalar(Math.max(0.35, 1 - bounce * 0.22));
      shadow.material.opacity = Math.max(0.05, 0.22 - bounce * 0.16);

      // parallax léger au scroll
      const s = window.scrollY / 1400;
      ball.position.x = Math.sin(t * 0.25) * 0.12 - s * 0.35;
      camera.position.x = -s * 0.5;
      camera.position.y = 1.5 - s * 0.35;
      camera.lookAt(0, 0.1, 0);

      // particules flottantes
      dust.rotation.y = t * 0.02;

      renderer.render(scene, camera);
    }
    animate();
  } catch (e) {
    console.error('Erreur scène 3D :', e);
    const c = document.getElementById('ball-canvas');
    if (c) c.remove();
  }
}

initScene();