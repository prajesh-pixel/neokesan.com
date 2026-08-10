/* neoKesan product-page.js — Phase 5 (0.6.0)
 *
 * Dynamic product page renderer for product.html?key=<slug>. Reads the catalog
 * from window.NeoKesanCatalog (catalog.js): paints immediately from the
 * snapshot, then re-renders when the fresh fetch lands — no blank flash, and
 * admin edits appear as soon as a fresh catalog arrives.
 *
 * The static neobloom.html / neoponic.html / neofolix.html pages redirect here.
 *
 * Layout contract with product.html: the shared header/footer placeholders
 * (<div data-site-header></div> / <div data-site-footer></div>) live in
 * #product-app, OUTSIDE #product-content. renderProduct only rewrites
 * #product-content, so re-renders (snapshot -> fresh) never wipe the header or
 * footer that mountSharedLayout injected.
 */
(function () {
  'use strict';

  /* ----------------------------------------------------------------- key */

  function getKey() {
    return new URLSearchParams(window.location.search).get('key') || document.body.dataset.product || '';
  }

  /* --------------------------------------------------------- data helpers */

  // Legacy image sets — kept purely as an image fallback for the 3 seed
  // products (catalog.js's FALLBACK already carries these same images).
  const heroImageSet = {
    bloom: ['assets/neobloom.jpeg', 'assets/neobloom-group.jpeg', 'assets/neobloom-x1.jpeg', 'assets/neobloom-x2.jpeg', 'assets/neobloom-x3.jpeg'],
    ponic: ['assets/neoponic.jpeg', 'assets/neoponic-group.jpeg', 'assets/neoponic-a.jpeg', 'assets/neoponic-b.jpeg'],
    folix: ['assets/neofolix.jpeg', 'assets/neofolix-group.jpeg', 'assets/neofolix-x1.jpeg', 'assets/neofolix-x2.jpeg']
  };

  // Coerce one guide stage to the canonical shape every render path expects.
  // New DB rows are already normalized; this shims legacy shapes (ponic's bare
  // {steps,tdsPanel}, folix's [{steps}]) so one template handles all of them.
  function normalizeStages(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (s) {
      if (!s || typeof s !== 'object') return { label: '', tds: '', steps: [], tdsPanel: [] };
      return {
        label: s.label || '',
        tds: s.tds || '',
        steps: Array.isArray(s.steps) ? s.steps : [],
        tdsPanel: Array.isArray(s.tdsPanel) ? s.tdsPanel : []
      };
    });
  }

  function normalizeGuide(guide) {
    guide = guide && typeof guide === 'object' ? guide : {};
    return { hydro: normalizeStages(guide.hydro), soil: normalizeStages(guide.soil) };
  }

  // Map one public catalog payload ({slug,name,asin,page,amazonUrl,data}) into
  // the render shape used by the template below.
  function normalizeProduct(raw) {
    const d = (raw && raw.data && typeof raw.data === 'object') ? raw.data : {};
    const key = raw ? raw.slug : '';
    const images = (Array.isArray(d.images) && d.images.length) ? d.images : (heroImageSet[key] || []);
    return {
      key: key,
      name: d.name || (raw && raw.name) || key,
      family: d.family || '',
      category: d.category || '',
      word: d.word || '',
      accent: d.accent || '#5546ae',
      soft: d.soft || '#eeedfe',
      description: d.description || '',
      formula: d.formula || '',
      features: Array.isArray(d.features) ? d.features : [],
      guide: normalizeGuide(d.guide),
      composition: (Array.isArray(d.composition) && d.composition.length) ? d.composition : null,
      // Live price overlay (assets/live-prices.js) is pre-applied here so the
      // template never re-reads window.NEOKESAN_PRICES on every render.
      price: (window.NEOKESAN_PRICES && NEOKESAN_PRICES[key]) || d.price || '',
      images: images.length ? images : ['assets/logo.png'],
      amazonUrl: (raw && raw.amazonUrl) || ''
    };
  }

  /* -------------------------------------------------------------- markup */

  function compositionMarkup(p) {
    if (p.composition) {
      const tabs = p.composition.map((c, i) =>
        `<button class="ctab${i === 0 ? ' active' : ''}" onclick="showComp('${c.id}',this)">${c.name}</button>`
      ).join('');
      const panels = p.composition.map((c, i) => {
        const rows = c.elements.map(e => `<tr><td>${e[0]}</td><td>${e[1]}</td></tr>`).join('');
        const ratio = c.ratio
          ? `<div class="comp-ratio"><div class="section-kicker">${c.ratioLabel || 'Recommended mix'}</div><b>${c.ratio}</b>${c.ratioSub ? `<span class="comp-plus">${c.ratioSub}</span>` : ''}</div>`
          : '';
        const tds = c.tds
          ? `<div class="comp-tds"><div class="section-kicker">Recommended TDS range</div><b>${c.tds}</b><span>${c.tdsLabel || ''}</span></div>`
          : '';
        return `<div class="comp-panel${i === 0 ? ' active' : ''}" id="comp-${c.id}"><div class="comp-table-wrap"><h4>${p.name} ${c.desc}</h4><table class="comp-table"><thead><tr><th>Element</th><th>mg in 1 ml</th></tr></thead><tbody>${rows}</tbody></table><p class="comp-note">${c.note}</p></div><div class="comp-side">${ratio}${tds}</div></div>`;
      }).join('');
      return `<div class="comp-tabs">${tabs}</div>${panels}`;
    }
    // No composition on file (folix) — generic fallback built from the formula.
    return `<div class="composition"><table><thead><tr><th>Element</th><th>Purpose</th></tr></thead><tbody><tr><td>Nitrogen</td><td>Healthy foliage and growth</td></tr><tr><td>Potassium</td><td>Plant strength and yield</td></tr><tr><td>Calcium</td><td>Cell structure and resilience</td></tr><tr><td>Trace minerals</td><td>Balanced crop nutrition</td></tr></tbody></table><div class="ratio-box"><div class="section-kicker">Recommended mix</div><b>${p.formula}</b><p>Use according to your plant stage, water quality and TDS/EC target.</p></div></div>`;
  }

  // One guide stage -> markup. Handles stage blocks, numbered steps, the TDS
  // badge and the TDS info panel; soil stages simply have none of the TDS bits.
  function stageMarkup(s) {
    const head = s.label ? `<div class="stage-block"><div class="stage-label">${s.label}</div>` : '';
    const steps = `<div class="steps-list">${s.steps.map((x, i) =>
      `<div class="step-item"><div class="step-num">${i + 1}</div><div class="step-text">${x}</div></div>`
    ).join('')}</div>`;
    const tdsBadge = s.tds ? `<div class="tds-badge">🎯 Recommended TDS: ${s.tds}</div>` : '';
    const tail = s.label ? '</div>' : '';
    const tdsPanel = (s.tdsPanel && s.tdsPanel.length) ? `<div class="tds-panel">${s.tdsPanel.map(t =>
      `<div class="tds-box"><div class="range">${t.range}</div><div class="range-label">${t.label}</div></div>`
    ).join('')}</div>` : '';
    return head + steps + tdsBadge + tail + tdsPanel;
  }

  function methodMarkup(stages) {
    return stages.map(stageMarkup).join('');
  }

  /* ------------------------------------------------------------ rendering */

  let viewLogged = false;
  function maybeLogView(key) {
    if (viewLogged) return;
    viewLogged = true;
    if (window.NeoKesanAuth && window.NeoKesanAuth.isSignedIn()) {
      window.NeoKesanAuth.apiFetch('product-view', { method: 'POST', body: { key: key } }).catch(function () {});
    }
  }

  function renderProduct(entry) {
    const p = normalizeProduct(entry);
    const content = document.getElementById('product-content');
    if (!p.key || !content) { renderNotFound(); return; }

    maybeLogView(p.key);
    document.title = p.name + ' | neoKesan';
    document.documentElement.style.setProperty('--p-accent', p.accent);
    document.documentElement.style.setProperty('--p-soft', p.soft);

    const buy = p.amazonUrl
      ? `<a href="${p.amazonUrl}" target="_blank" rel="noopener" class="buy-now amazon-buy-btn">Buy on Amazon</a>`
      : `<a href="index.html#products" class="buy-now amazon-buy-btn">Browse products</a>`;

    content.innerHTML =
      `<div class="crumb"><a href="index.html">Home</a> / <a href="index.html#products">Products</a> / ${p.name} ${p.family}</div>` +
      `<main>` +
        `<section class="product-hero">` +
          `<div class="product-stage" data-word="${p.word}">` +
            `<div class="stage-visual">` +
              `<div class="product-hero-image product-hero-carousel">` +
                `<div class="hero-carousel-slides">` +
                  p.images.map((img, i) =>
                    `<img src="${img}" alt="${p.name}" class="hero-carousel-slide${i === 0 ? ' active' : ''}" loading="lazy">`
                  ).join('') +
                `</div>` +
                `<button class="hero-carousel-prev">&#8249;</button>` +
                `<button class="hero-carousel-next">&#8250;</button>` +
              `</div>` +
            `</div>` +
          `</div>` +
          `<div class="product-info">` +
            `<div class="product-category">${p.category}</div>` +
            `<h1>${p.name} <strong>${p.family}</strong></h1>` +
            `<p>${p.description}</p>` +
            `<div class="rule"></div>` +
            (p.price ? `<div class="price"><span id="price">&#8377;${p.price}</span></div>` : '') +
            `<div class="purchase-row"><div class="buy-buttons">${buy}</div></div>` +
            `<div class="highlights"><div>Formulated for modern home and commercial growers</div><div>Clear, easy-to-follow usage instructions</div><div>Works with hydroponic and soil-based growing</div></div>` +
            `<div class="systems"><span>Compatible with</span><span>NFT</span><span>Deep Water Culture</span><span>Kratky</span><span>Drip system</span><span>Soil & potting mix</span></div>` +
          `</div>` +
        `</section>` +
        `<section class="product-section">` +
          `<div class="section-kicker">What it does</div>` +
          `<h2>Made to help your plants thrive</h2>` +
          `<div class="feature-grid">` +
            p.features.map((f, i) =>
              `<article class="feature"><div class="feature-icon">${['', '', '', ''][i]}</div><h3>${f[0]}</h3><p>${f[1]}</p></article>`
            ).join('') +
          `</div>` +
        `</section>` +
        `<section class="product-section soft-section">` +
          `<div class="section-kicker">Composition</div>` +
          `<h2>Simple, purposeful nutrition</h2>` +
          compositionMarkup(p) +
        `</section>` +
        `<section class="product-section">` +
          `<div class="section-kicker">How to use</div>` +
          `<h2>Application guide</h2>` +
          `<div class="method-tabs"><button class="mtab active" onclick="showMethod('hydro',this)">Hydroponic setup</button><button class="mtab" onclick="showMethod('soil',this)">Soil / pot</button></div>` +
          `<div class="method-panel active" id="method-hydro">${methodMarkup(p.guide.hydro)}</div>` +
          `<div class="method-panel" id="method-soil">${methodMarkup(p.guide.soil)}</div>` +
        `</section>` +
        `<section class="product-section soft-section">` +
          `<div class="section-kicker">Dos and don'ts</div>` +
          `<h2>For healthy plants and better yields</h2>` +
          `<div class="dos-grid">` +
            `<article class="do-card"><h3> Do</h3><ul><li>Follow your crop's TDS or EC target.</li><li>Measure doses carefully.</li><li>Store bottles in a cool, dry place.</li></ul></article>` +
            `<article class="dont-card"><h3> Don't</h3><ul><li>Do not consume the nutrient solution.</li><li>Do not apply concentrates directly to roots.</li><li>Do not spray in strong sunlight.</li></ul></article>` +
          `</div>` +
        `</section>` +
      `</main>`;
    bindProductPage();
  }

  function renderNotFound() {
    const content = document.getElementById('product-content');
    if (!content) return;
    document.title = 'Product not found | neoKesan';
    document.documentElement.style.setProperty('--p-accent', '#5546ae');
    document.documentElement.style.setProperty('--p-soft', '#eeedfe');
    content.innerHTML =
      `<div class="product-notfound">` +
        `<div class="notfound-card">` +
          `<div class="section-kicker">Product not found</div>` +
          `<h1>We couldn't find that product</h1>` +
          `<p>The product you're looking for may have been removed, or the link may be incorrect.</p>` +
          `<a class="button primary" href="index.html#products">Browse all products</a>` +
        `</div>` +
      `</div>`;
  }

  function render() {
    const key = getKey();
    const entry = window.NeoKesanCatalog.get(key);
    if (entry) renderProduct(entry);
    else renderNotFound();
  }

  function bindProductPage() {
    // Hero image carousel (the only in-page binding needed — the shared
    // header/footer are owned by shared-layout.js; the old .product-dropdown
    // is gone).
    document.querySelectorAll('.hero-carousel-slides').forEach(function (carousel) {
      const slides = carousel.querySelectorAll('.hero-carousel-slide');
      const prev = carousel.parentElement.querySelector('.hero-carousel-prev');
      const next = carousel.parentElement.querySelector('.hero-carousel-next');
      let current = 0;
      function show(idx) {
        slides.forEach(function (s) { s.classList.remove('active'); });
        current = (idx + slides.length) % slides.length;
        slides[current].classList.add('active');
      }
      if (prev) prev.onclick = function (e) { e.preventDefault(); show(current - 1); };
      if (next) next.onclick = function (e) { e.preventDefault(); show(current + 1); };
    });
  }

  /* ------------------------------------------------------- comp/method tabs */

  // Inline onclick handlers reference these — expose them on window.
  window.showComp = function (id, el) {
    document.querySelectorAll('.comp-panel').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.ctab').forEach(function (t) { t.classList.remove('active'); });
    var panel = document.getElementById('comp-' + id);
    if (panel) panel.classList.add('active');
    if (el) el.classList.add('active');
  };
  window.showMethod = function (id, el) {
    document.querySelectorAll('.method-panel').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.mtab').forEach(function (t) { t.classList.remove('active'); });
    var panel = document.getElementById('method-' + id);
    if (panel) panel.classList.add('active');
    if (el) el.classList.add('active');
  };

  /* ------------------------------------------------------------------ boot */

  document.addEventListener('DOMContentLoaded', function () {
    const catalog = window.NeoKesanCatalog;
    if (!catalog || typeof catalog.get !== 'function') {
      renderNotFound();
      return;
    }
    render();
    // Re-render when the fresh catalog lands (snapshot -> live). Safe to run
    // again: it only rewrites #product-content, never the shared header/footer.
    if (typeof catalog.load === 'function') {
      catalog.load().then(function () { render(); });
    }
  });

  console.log('[neoKesan] product-page v20260810c');
})();
