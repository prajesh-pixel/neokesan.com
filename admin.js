/* neoKesan admin.js — admin-only dashboard (Analytics + Products).
 * Runs on admin.html. Admin-ness is enforced server-side (manage_options);
 * here we only surface a 403. Relies on window.NeoKesanAuth for session + API
 * and window.NeoKesanCatalog to refresh the public catalog cache after edits.
 * Logs a version marker so stale cache is easy to spot.
 */
(function () {
  'use strict';

  console.log('[neoKesan] admin v20260810e');

  // Question prompts (mirror script.js) so attempts render as Q -> answer.
  const QUIZ_QUESTIONS = [
    'What are you growing?',
    'How large is your growing area?',
    'How are you growing your plants?',
    'What is your main goal or challenge?',
  ];

  // Fallback labels only — the live map is rebuilt from admin/products on load.
  const PRODUCT_LABELS = { folix: 'NeoFolix', bloom: 'NeoBloom', ponic: 'NeoPonic' };

  const root = () => document.getElementById('admin-dashboard');

  // Escapes ' too (existing helper omitted it) so values are safe inside
  // single-quoted attributes as well as element text.
  const esc = value =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const fmtTime = iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  const card = (label, value, sub) =>
    '<div class="stat-card"><small>' + esc(label) + '</small><b>' + value + '</b>' +
    (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') + '</div>';

  /* ----------------------- dynamic product labels (analytics) ----------------------- */
  let labels = Object.assign({}, PRODUCT_LABELS);
  let labelsCached = false;
  function setLabels(list) {
    if (!Array.isArray(list)) return;
    list.forEach(p => {
      if (!p || !p.slug) return;
      labels[p.slug] = (p.data && p.data.name) || p.name || p.slug;
    });
  }
  function labelFor(key) { return labels[key] || key; }

  /* ----------------------- app state ----------------------- */
  let tab = 'analytics';       // 'analytics' | 'products'
  let products = [];           // admin product list (admin payload shape)
  let editing = null;          // product being edited (null = creating)
  let imagesState = [];        // current images array for the open form
  let contentDelegationBound = null; // element the delegated handler is attached to

  const val = sel => { const el = document.querySelector(sel); return el ? el.value.trim() : ''; };

  /* ----------------------- gate / shell ----------------------- */

  function gateView() {
    root().innerHTML =
      '<div class="admin-gate">' +
      '<h2>Admin dashboard</h2>' +
      '<p>Sign in with an admin account to manage your product catalog and view analytics for your customers.</p>' +
      '<button class="button primary" id="admin-signin">Sign in</button>' +
      '</div>';
    document.getElementById('admin-signin').addEventListener('click', () => {
      window.NeoKesanAuth.openAuthModal();
    });
  }

  function deniedView() {
    root().innerHTML =
      '<div class="admin-denied">' +
      '<h2>Admin access only</h2>' +
      '<p>Your account doesn\'t have admin privileges, so the dashboard isn\'t available to you.</p>' +
      '</div>';
  }

  function shellHtml(active) {
    return '<div class="admin-tabs">' +
      '<button type="button" class="tab' + (active === 'analytics' ? ' active' : '') + '" data-tab="analytics">Analytics</button>' +
      '<button type="button" class="tab' + (active === 'products' ? ' active' : '') + '" data-tab="products">Products</button>' +
      '</div><div id="tab-content"><div class="admin-loading">Loading…</div></div>';
  }

  function bindTabBar() {
    document.querySelectorAll('.admin-tabs .tab').forEach(btn => {
      btn.onclick = () => {
        tab = btn.dataset.tab;
        document.querySelectorAll('.admin-tabs .tab').forEach(b => b.classList.toggle('active', b === btn));
        renderTabContent();
      };
    });
  }

  function renderTabContent() {
    const content = document.getElementById('tab-content');
    if (!content) return;
    if (tab === 'products') renderProductsTab();
    else renderAnalyticsTab();
  }

  function renderDashboard() {
    if (!window.NeoKesanAuth || !window.NeoKesanAuth.isSignedIn()) {
      gateView();
      return;
    }
    root().innerHTML = shellHtml(tab);
    bindTabBar();
    renderTabContent();
  }

  /* ----------------------- analytics tab (unchanged behaviour, labelFor) ----------------------- */

  function renderAnalyticsTab() {
    const content = document.getElementById('tab-content');
    if (!content) return;
    content.innerHTML = '<div class="admin-loading">Loading analytics…</div>';

    // Load product names for labels if we haven't yet; a hiccup here shouldn't
    // block analytics (labels fall back to the slug / const map).
    const labelsReady = labelsCached
      ? Promise.resolve()
      : window.NeoKesanAuth.apiFetch('admin/products')
          .then(list => { labelsCached = true; setLabels(list); })
          .catch(() => {});

    labelsReady
      .then(() => window.NeoKesanAuth.apiFetch('admin/stats'))
      .then(stats => {
        if (tab !== 'analytics' || !document.getElementById('tab-content')) return;
        content.innerHTML = statsHtml(stats);
        return window.NeoKesanAuth.apiFetch('admin/users');
      })
      .then(users => {
        if (tab !== 'analytics') return;
        if (!users || !Array.isArray(users)) return;
        const el = document.getElementById('admin-users');
        if (el) {
          el.innerHTML = userRows(users);
          bindExpanders();
        }
      })
      .catch(err => {
        if (tab !== 'analytics' || !document.getElementById('tab-content')) return;
        if (err && err.status === 403) { deniedView(); return; }
        if (err && err.status === 401) { return; } // auth.js already signed us out; authchange re-renders the gate
        const msg = err.message || 'Something went wrong.';
        window.NeoKesanAuth.showToast(msg);
        content.innerHTML =
          '<div class="admin-denied"><h2>Couldn\'t load the dashboard</h2><p>' + esc(msg) + '</p></div>';
      });
  }

  function statsHtml(stats) {
    const byProduct = Object.keys(stats.views_by_product || {});
    const productChips = byProduct.length
      ? '<div class="by-product">' + byProduct.map(key =>
          '<span>' + esc(labelFor(key)) + ' — ' + stats.views_by_product[key] + '</span>'
        ).join('') + '</div>'
      : '<p class="empty-state">No product views yet.</p>';

    return (
      '<div class="admin-heading">' +
      '<span class="eyebrow">neoKesan analytics</span>' +
      '<h1>Admin dashboard</h1>' +
      '<p>Product views, quiz answers and buy-on-Amazon clicks across your signed-in customers.</p>' +
      '</div>' +
      '<div class="stat-grid">' +
      card('Registered users', stats.users_total) +
      card('Active users', stats.active_users, 'with recorded activity') +
      card('Product views', stats.views_total) +
      card('Quiz attempts', stats.quiz_attempts_total, stats.quiz_users + ' user' + (stats.quiz_users === 1 ? '' : 's')) +
      card('Amazon clicks', stats.picks_total) +
      '</div>' +
      '<div class="admin-section"><h2>Views per product</h2>' + productChips + '</div>' +
      '<div class="admin-section"><h2>Users</h2><div id="admin-users">' +
      '<div class="admin-loading">Loading…</div></div></div>'
    );
  }

  function detailHtml(u) {
    const v = u.views || {};
    const q = u.quiz || {};
    const attempts = q.attempts || [];
    const picks = q.picks || [];
    const parts = [];

    parts.push(
      '<div class="detail-block"><h3>Product views</h3>' +
      ((v.events || []).length
        ? v.events.slice().reverse().map(e =>
            '<p class="view-event"><b>' + esc(e.name || labelFor(e.key)) + '</b> — ' + fmtTime(e.viewed_at) + '</p>'
          ).join('')
        : '<p class="empty-state">No views yet.</p>') +
      '</div>'
    );

    parts.push(
      '<div class="detail-block"><h3>Quiz answers</h3>' +
      (attempts.length
        ? attempts.slice().reverse().map(a => {
            const answers = a.answers || [];
            const qRows = answers.map((ans, i) =>
              '<div class="q-row"><span class="qn">' + (i + 1) + '</span>' +
              '<span class="qt">' + esc(QUIZ_QUESTIONS[i] || 'Question ' + (i + 1)) + '</span>' +
              '<span class="qa">' + esc(ans) + '</span></div>'
            ).join('');
            return '<div class="attempt-block">' +
              '<p class="attempt-head">Attempt #' + a.attempt_no + ' · ' + fmtTime(a.saved_at) + ' → ' + esc(a.title || '—') + '</p>' +
              qRows + '</div>';
          }).join('')
        : '<p class="empty-state">No quiz attempts yet.</p>') +
      '</div>'
    );

    parts.push(
      '<div class="detail-block"><h3>Buy on Amazon</h3>' +
      (picks.length
        ? picks.slice().reverse().map(p =>
            '<p class="pick-event"><b>' + esc(p.name || p.key) + '</b> — attempt #' + (p.attempt_no || '—') + ' · ' + fmtTime(p.clicked_at) + '</p>'
          ).join('')
        : '<p class="empty-state">No clicks yet.</p>') +
      '</div>'
    );

    return parts.join('');
  }

  function userRows(users) {
    if (!users.length) return '<p class="empty-state">No user activity yet.</p>';

    const rows = users.map(u => {
      const v = u.views || {};
      const q = u.quiz || {};
      const attempts = q.attempts || [];
      const picks = q.picks || [];
      const byProduct = Object.keys(v.by_product || {});

      const tags = [];
      if (v.total) tags.push(v.total + ' view' + (v.total === 1 ? '' : 's'));
      if (attempts.length) tags.push(attempts.length + ' attempt' + (attempts.length === 1 ? '' : 's'));
      if (picks.length) tags.push(picks.length + ' click' + (picks.length === 1 ? '' : 's'));

      return (
        '<tr class="row-expandable" data-user="' + u.user_id + '">' +
        '<td><strong>' + esc(u.name || '—') + '</strong>' +
        (u.email ? '<div class="user-email">' + esc(u.email) + '</div>' : '') + '</td>' +
        '<td>' + (tags.length
          ? '<div class="meta-tags">' + tags.map(t => '<span>' + t + '</span>').join('') + '</div>'
          : '<p class="empty-state">No activity</p>') + '</td>' +
        '<td>' + (byProduct.length
          ? '<div class="meta-tags">' + byProduct.map(key =>
              '<span>' + esc(labelFor(key)) + ' ×' + v.by_product[key] + '</span>'
            ).join('') + '</div>'
          : '<p class="empty-state">No views yet</p>') + '</td>' +
        '<td>' + fmtTime(u.created_at) + '</td>' +
        '</tr>' +
        '<tr class="detail-row" data-detail="' + u.user_id + '">' +
        '<td colspan="4"><div class="user-detail">' + detailHtml(u) + '</div></td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="table-wrap"><table class="admin-table">' +
      '<thead><tr><th>User</th><th>Activity</th><th>Products viewed</th><th>Joined</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table></div>'
    );
  }

  function bindExpanders() {
    document.querySelectorAll('tr.row-expandable').forEach(tr => {
      tr.addEventListener('click', () => {
        const detail = document.querySelector('tr.detail-row[data-detail="' + tr.dataset.user + '"]');
        if (!detail) return;
        const open = detail.classList.toggle('open');
        tr.classList.toggle('open', open);
      });
    });
  }

  /* ----------------------- products tab: list ----------------------- */

  function renderProductsTab() {
    const content = document.getElementById('tab-content');
    if (!content) return;
    content.innerHTML = '<div class="admin-loading">Loading products…</div>';
    window.NeoKesanAuth.apiFetch('admin/products')
      .then(list => {
        if (!Array.isArray(list)) throw new Error('Unexpected product list response.');
        products = list;
        setLabels(list);
        refreshCatalogAfterSave();
        // State and cache updates above happen regardless of which tab is showing;
        // only the DOM write is skipped if the user switched tabs mid-fetch.
        if (tab !== 'products' || !document.getElementById('tab-content')) return;
        content.innerHTML = productsListHtml(list);
        bindProductsList();
      })
      .catch(err => {
        if (tab !== 'products' || !document.getElementById('tab-content')) return;
        if (err && err.status === 403) { deniedView(); return; }
        if (err && err.status === 401) { return; }
        const msg = err.message || 'Couldn\'t load products.';
        window.NeoKesanAuth.showToast(msg);
        content.innerHTML =
          '<div class="admin-denied"><h2>Couldn\'t load products</h2><p>' + esc(msg) + '</p></div>';
      });
  }

  function productsListHtml(list) {
    const rows = list.map(p => {
      const d = (p.data && typeof p.data === 'object') ? p.data : {};
      const status = p.status || 'active';
      const price = d.price ? '₹' + esc(d.price) : '—';
      const archived = status === 'archived';
      return '<tr>' +
        '<td><strong>' + esc(p.name || d.name || p.slug) + '</strong>' +
        '<div class="user-email">' + esc(p.slug) + '</div></td>' +
        '<td>' + esc(d.category || '—') + '</td>' +
        '<td>' + price + '</td>' +
        '<td><span class="status-badge st-' + esc(status) + '">' + esc(status) + '</span></td>' +
        '<td>' + fmtTime(p.updated_at || p.created_at) + '</td>' +
        '<td class="row-actions">' +
        '<button type="button" class="btn-link" data-edit="' + esc(p.slug) + '">Edit</button> ' +
        '<button type="button" class="btn-link" data-status="' + esc(p.slug) + '" data-next="' + (archived ? 'active' : 'archived') + '">' + (archived ? 'Restore' : 'Archive') + '</button> ' +
        '<button type="button" class="btn-link danger" data-del="' + esc(p.slug) + '">Delete</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    return '<div class="products-toolbar">' +
      '<div><span class="eyebrow" style="color:var(--green)">neoKesan catalog</span>' +
      '<h1>Products</h1>' +
      '<p>Create and edit the products shown across the homepage, header menu, product pages and quiz recommendations.</p></div>' +
      '<button type="button" class="button primary" id="new-product">+ New product</button>' +
      '</div>' +
      '<div class="admin-section">' +
      '<div class="table-wrap"><table class="admin-table">' +
      '<thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>' +
      '<tbody>' + (list.length ? rows : '<tr><td colspan="6"><p class="empty-state">No products yet — create your first one.</p></td></tr>') + '</tbody>' +
      '</table></div></div>';
  }

  function bindProductsList() {
    const el = document.getElementById('tab-content');
    if (!el) return;
    const newBtn = document.getElementById('new-product');
    if (newBtn) newBtn.onclick = () => openProductForm(null);
    el.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => {
      const p = findProduct(btn.dataset.edit);
      if (p) openProductForm(p);
    });
    el.querySelectorAll('[data-status]').forEach(btn => btn.onclick = () => {
      setProductStatus(btn.dataset.status, btn.dataset.next);
    });
    el.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => {
      const p = findProduct(btn.dataset.del);
      if (p) openDeleteConfirm(p);
    });
  }

  function findProduct(key) {
    for (let i = 0; i < products.length; i++) if (products[i].slug === key) return products[i];
    return null;
  }

  function setProductStatus(key, status) {
    window.NeoKesanAuth.apiFetch('products/' + encodeURIComponent(key), { method: 'PUT', body: { status } })
      .then(() => {
        window.NeoKesanAuth.showToast(status === 'archived' ? 'Product archived — hidden from the site' : 'Product restored — live again');
        renderProductsTab();
      })
      .catch(err => window.NeoKesanAuth.showToast(err.message || 'Couldn\'t update the product.'));
  }

  /* Push the current admin list into the public catalog cache so the homepage,
   * header menu and product pages reflect a mutation immediately. Hostinger's
   * CDN caches GET /products for days, so we must NOT re-fetch it here. */
  function refreshCatalogAfterSave() {
    const catalog = window.NeoKesanCatalog;
    if (!catalog || typeof catalog.setFresh !== 'function') return;
    const publicList = products
      .filter(p => p && p.status === 'active')
      .map(p => {
        const d = (p.data && typeof p.data === 'object') ? p.data : {};
        return {
          slug: p.slug,
          name: p.name || d.name || p.slug,
          asin: p.asin || '',
          page: 'product.html?key=' + encodeURIComponent(p.slug),
          amazonUrl: p.asin ? ('https://www.amazon.in/dp/' + p.asin) : '',
          data: d,
          updated_at: p.updated_at || ''
        };
      });
    if (publicList.length) catalog.setFresh(publicList);
  }

  /* ----------------------- products tab: structured form ----------------------- */

  const emptyStage = () => ({ label: '', tds: '', steps: [], tdsPanel: [] });
  const emptyPart = () => ({ id: '', name: '', desc: '', note: '', ratio: '', ratioLabel: '', ratioSub: '', tds: '', tdsLabel: '', elements: [] });

  const fieldHtml = (labelText, inputHtml, wide) =>
    '<label class="field' + (wide ? ' wide' : '') + '"><span>' + esc(labelText) + '</span>' + inputHtml + '</label>';
  const textIn = (attr, v, placeholder) =>
    '<input type="text" data-' + attr + ' value="' + esc(v) + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '>';
  const area = (attr, v, rows) => '<textarea data-' + attr + ' rows="' + (rows || 3) + '">' + esc(v) + '</textarea>';

  const ROW_SEL = { feature: 'data-feat-row', stage: 'data-stage-row', tds: 'data-tds-row', comp: 'data-comp-row', element: 'data-el-row' };

  function featureRowHtml(t, b) {
    return '<div class="repeat-row" data-feat-row>' +
      '<div class="form-grid">' +
      fieldHtml('Title', textIn('feat-title', t)) +
      fieldHtml('Body', area('feat-body', b, 2), true) +
      '</div>' +
      '<button type="button" class="repeat-remove" data-remove="feature" title="Remove feature">×</button></div>';
  }

  function tdsRowHtml(t) {
    t = t || {};
    return '<div class="repeat-row inline" data-tds-row>' +
      '<input data-tds-range type="text" placeholder="600-900 ppm" value="' + esc(t.range || '') + '">' +
      '<input data-tds-label type="text" placeholder="Leafy greens & herbs" value="' + esc(t.label || '') + '">' +
      '<button type="button" class="repeat-remove" data-remove="tds" title="Remove">×</button></div>';
  }

  function stageRowHtml(s) {
    s = s || emptyStage();
    const tdsRows = (Array.isArray(s.tdsPanel) ? s.tdsPanel : []).map(tdsRowHtml).join('');
    return '<div class="repeat-row" data-stage-row>' +
      '<div class="form-grid">' +
      fieldHtml('Stage label', textIn('stage-label', s.label, 'e.g. Vegetative growth stage')) +
      fieldHtml('TDS', textIn('stage-tds', s.tds, 'e.g. 800-1200 ppm')) +
      fieldHtml('Steps — one per line', area('stage-steps', (Array.isArray(s.steps) ? s.steps : []).join('\n'), 5), true) +
      '</div>' +
      '<div class="field wide"><span>TDS reference panel</span>' +
      '<div class="repeat-wrap" data-tds>' + tdsRows + '</div>' +
      '<button type="button" class="repeat-add small" data-add="tds">+ Add TDS range</button></div>' +
      '<button type="button" class="repeat-remove" data-remove="stage" title="Remove stage">×</button></div>';
  }

  function elRowHtml(name, value) {
    return '<div class="repeat-row inline" data-el-row>' +
      '<input data-el-name type="text" placeholder="Element name" value="' + esc(name) + '">' +
      '<input data-el-value type="text" placeholder="mg per ml" value="' + esc(value) + '">' +
      '<button type="button" class="repeat-remove" data-remove="element" title="Remove">×</button></div>';
  }

  function compRowHtml(c) {
    c = c || emptyPart();
    const els = (Array.isArray(c.elements) ? c.elements : []).map(e => elRowHtml(e[0], e[1])).join('');
    return '<div class="repeat-row" data-comp-row>' +
      '<div class="form-grid">' +
      fieldHtml('Part id (a-z, 0-9, - and _) *', textIn('comp-id', c.id, 'e.g. bloom1')) +
      fieldHtml('Part name *', textIn('comp-name', c.name, 'e.g. NeoBloom X1')) +
      fieldHtml('Description', textIn('comp-desc', c.desc)) +
      fieldHtml('Ratio', textIn('comp-ratio', c.ratio)) +
      fieldHtml('Ratio label', textIn('comp-ratiolabel', c.ratioLabel)) +
      fieldHtml('Ratio sub', textIn('comp-ratiosub', c.ratioSub)) +
      fieldHtml('TDS', textIn('comp-tds', c.tds)) +
      fieldHtml('TDS label', textIn('comp-tdslabel', c.tdsLabel)) +
      fieldHtml('Note', area('comp-note', c.note, 2), true) +
      '<div class="field wide"><span>Elements (mg per 1 ml)</span>' +
      '<div class="repeat-wrap" data-els>' + els + '</div>' +
      '<button type="button" class="repeat-add small" data-add="element">+ Add element</button></div>' +
      '</div>' +
      '<button type="button" class="repeat-remove" data-remove="comp" title="Remove part">×</button></div>';
  }

  function formSection(title, hint, bodyHtml) {
    return '<section class="form-section open">' +
      '<button type="button" class="form-section-head"><h3>' + esc(title) + '</h3>' +
      '<span class="hint">' + esc(hint) + '</span><span class="chev">▾</span></button>' +
      '<div class="form-section-body">' + bodyHtml + '</div></section>';
  }

  function normColor(c) {
    c = (c || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#5546ae';
  }

  function basicsHtml(d, isEdit, statusOpts, p) {
    const keyField = isEdit
      ? '<input type="text" value="' + esc(p.slug) + '" disabled><input type="hidden" data-key value="' + esc(p.slug) + '">'
      : textIn('key', '', 'auto-filled from name — a-z, 0-9, - and _ only');
    return '<div class="form-grid">' +
      fieldHtml('Product name *', '<input data-name type="text" required value="' + esc(d.name || '') + '">') +
      fieldHtml(isEdit ? 'Key / slug (locked)' : 'Key / slug *', keyField) +
      fieldHtml('Status', '<select data-status>' + statusOpts + '</select>') +
      fieldHtml('Amazon ASIN', textIn('asin', p && p.asin || '', 'e.g. B0HBWZ4G26')) +
      fieldHtml('Price (₹)', '<input data-price type="text" inputmode="decimal" placeholder="749" value="' + esc(d.price || '') + '">') +
      fieldHtml('Family', textIn('family', d.family, 'e.g. X1, X2, X3')) +
      fieldHtml('Category', textIn('category', d.category, 'e.g. Blooming solution')) +
      fieldHtml('Badge', textIn('badge', d.badge, 'e.g. Blooming')) +
      fieldHtml('Word', textIn('word', d.word, 'e.g. BLOOM')) +
      fieldHtml('Accent colour', '<div class="color-row"><input type="color" data-accent-color value="' + esc(normColor(d.accent)) + '"><input type="text" data-accent value="' + esc(d.accent || '') + '" placeholder="#5546ae"></div>') +
      fieldHtml('Soft colour', '<div class="color-row"><input type="color" data-soft-color value="' + esc(normColor(d.soft)) + '"><input type="text" data-soft value="' + esc(d.soft || '') + '" placeholder="#eeedfe"></div>') +
      fieldHtml('Description', area('description', d.description, 3), true) +
      fieldHtml('Formula', textIn('formula', d.formula, 'e.g. 50 ml X1 + 25 ml X3'), true) +
      '</div>';
  }

  function compHtml(none, compsHtml) {
    return '<label class="check"><input type="checkbox" id="comp-none"' + (none ? ' checked' : '') + '> No composition — show the generic fallback table built from the formula (folix style)</label>' +
      '<div id="comp-parts"' + (none ? ' class="hidden"' : '') + '>' +
      '<div class="repeat-wrap">' + compsHtml + '</div>' +
      '<button type="button" class="repeat-add" data-add="comp">+ Add composition part</button>' +
      '</div>';
  }

  function imagesHtml(isEdit) {
    const note = isEdit
      ? ''
      : '<div class="note-banner">Save the product first — images are attached to it after creation.</div>';
    return note +
      '<div class="img-list" id="img-list"></div>' +
      '<div class="img-actions">' +
      '<input type="file" id="img-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>' +
      '<button type="button" class="button ghost" id="img-upload"' + (isEdit ? '' : ' disabled') + '>+ Upload image</button>' +
      '<span class="hint">JPEG, PNG, WebP or GIF · max 2 MB</span>' +
      '</div>';
  }

  function openProductForm(p) {
    editing = p || null;
    const d = (p && p.data && typeof p.data === 'object') ? p.data : {};
    imagesState = Array.isArray(d.images) ? d.images.slice() : [];
    const isEdit = !!p;

    const statusOpts = ['active', 'draft', 'archived'].map(s =>
      '<option value="' + s + '"' + (s === (p ? p.status : 'active') ? ' selected' : '') + '>' + s + '</option>').join('');

    const features = (Array.isArray(d.features) ? d.features : []).map(f => featureRowHtml(f[0], f[1])).join('');
    const guideHydro = (d.guide && Array.isArray(d.guide.hydro) ? d.guide.hydro : []).map(stageRowHtml).join('');
    const guideSoil = (d.guide && Array.isArray(d.guide.soil) ? d.guide.soil : []).map(stageRowHtml).join('');
    const comps = Array.isArray(d.composition) ? d.composition.map(compRowHtml).join('') : '';
    const compNone = !Array.isArray(d.composition) || !d.composition.length;

    const content = document.getElementById('tab-content');
    content.innerHTML =
      '<form class="admin-form" id="product-form" novalidate>' +
      formSection('Basics', 'Name, key, price & status', basicsHtml(d, isEdit, statusOpts, p)) +
      formSection('Features', 'up to 8', '<div class="repeat-wrap">' + features + '</div><button type="button" class="repeat-add" data-add="feature">+ Add feature</button>') +
      formSection('Application guide', 'hydro + soil stages',
        '<div class="guide-tabs">' +
        '<button type="button" class="gtab active" data-gtab="hydro">Hydroponic</button>' +
        '<button type="button" class="gtab" data-gtab="soil">Soil / pot</button></div>' +
        '<div class="guide-panel active" id="guide-hydro"><div class="repeat-wrap">' + guideHydro + '</div><button type="button" class="repeat-add" data-add="stage">+ Add hydro stage</button></div>' +
        '<div class="guide-panel" id="guide-soil"><div class="repeat-wrap">' + guideSoil + '</div><button type="button" class="repeat-add" data-add="stage">+ Add soil stage</button></div>') +
      formSection('Composition', 'nutrient breakdown', compHtml(compNone, comps)) +
      formSection('Images', isEdit ? 'attach & arrange' : 'save product first', imagesHtml(isEdit)) +
      '<div class="form-actions">' +
      '<button type="button" class="button ghost" id="cancel-product">Cancel</button>' +
      '<button type="submit" class="button primary" id="save-product">' + (isEdit ? 'Save changes' : 'Create product') + '</button>' +
      '</div></form>';

    bindProductForm(isEdit);
  }

  function bindProductForm(isEdit) {
    const form = document.getElementById('product-form');
    const content = document.getElementById('tab-content');

    // Collapsible sections.
    content.querySelectorAll('.form-section-head').forEach(head => {
      head.onclick = () => { head.closest('.form-section').classList.toggle('closed'); };
    });

    // Guide hydro/soil tabs.
    content.querySelectorAll('.guide-tabs .gtab').forEach(btn => {
      btn.onclick = () => {
        content.querySelectorAll('.guide-tabs .gtab').forEach(b => b.classList.toggle('active', b === btn));
        content.querySelectorAll('.guide-panel').forEach(panel => panel.classList.toggle('active', panel.id === 'guide-' + btn.dataset.gtab));
      };
    });

    // Colour picker <-> hex text sync (the text field is the source of truth).
    content.querySelectorAll('[data-accent-color]').forEach(pi => {
      pi.oninput = () => { const t = content.querySelector('[data-accent]'); if (t) t.value = pi.value; };
    });
    content.querySelectorAll('[data-soft-color]').forEach(pi => {
      pi.oninput = () => { const t = content.querySelector('[data-soft]'); if (t) t.value = pi.value; };
    });

    // Auto-slug the key from the name on create (stops once the key is touched).
    if (!isEdit) {
      const nameIn = document.querySelector('[data-name]');
      const keyIn = document.querySelector('[data-key]');
      let keyTouched = false;
      if (keyIn) keyIn.addEventListener('input', () => { keyTouched = true; });
      if (nameIn) nameIn.addEventListener('input', () => {
        if (keyTouched) return;
        keyIn.value = slugify(nameIn.value);
      });
    }

    // "No composition" toggle (folix).
    const compNone = document.getElementById('comp-none');
    const compParts = document.getElementById('comp-parts');
    if (compNone && compParts) {
      compNone.onchange = () => compParts.classList.toggle('hidden', compNone.checked);
    }

    ensureContentDelegation();

    renderImgList();
    bindImgControls(isEdit);

    const cancel = document.getElementById('cancel-product');
    if (cancel) cancel.onclick = () => { editing = null; renderProductsTab(); };

    form.addEventListener('submit', e => { e.preventDefault(); onSaveProduct(); });
  }

  // Delegated add/remove for the repeatable rows. Attached to the current
  // #tab-content once — innerHTML swaps keep the same element, so re-binding on
  // every form render would stack duplicate handlers. But signing out and back
  // in rebuilds the whole shell (a fresh #tab-content), so we key the guard on
  // the element itself, not a boolean.
  function ensureContentDelegation() {
    const content = document.getElementById('tab-content');
    if (!content || contentDelegationBound === content) return;
    contentDelegationBound = content;
    content.addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      const rm = e.target.closest('[data-remove]');
      if (add) { e.preventDefault(); addRow(add); }
      else if (rm) {
        e.preventDefault();
        const sel = ROW_SEL[rm.dataset.remove];
        if (sel) rm.closest('[' + sel + ']').remove();
      }
    });
  }

  function addRow(btn) {
    const type = btn.dataset.add;
    let row = '';
    if (type === 'feature') row = featureRowHtml('', '');
    else if (type === 'stage') row = stageRowHtml(emptyStage());
    else if (type === 'tds') row = tdsRowHtml({});
    else if (type === 'comp') row = compRowHtml(emptyPart());
    else if (type === 'element') row = elRowHtml('', '');
    if (!row) return;
    let wrap;
    if (type === 'stage') wrap = btn.closest('.guide-panel') && btn.closest('.guide-panel').querySelector('.repeat-wrap');
    else wrap = btn.previousElementSibling;
    if (wrap && wrap.classList.contains('repeat-wrap')) wrap.insertAdjacentHTML('beforeend', row);
  }

  /* ----------------------- images ----------------------- */

  function renderImgList() {
    const list = document.getElementById('img-list');
    if (!list) return;
    list.innerHTML = imagesState.map((url, i) =>
      '<div class="img-thumb' + (i === 0 ? ' hero' : '') + '">' +
      (i === 0 ? '<span class="hero-tag">Hero</span>' : '') +
      '<img src="' + esc(url) + '" alt="">' +
      '<div class="img-meta">' +
      (i !== 0 ? '<button type="button" class="img-hero" data-img-hero="' + i + '">Set hero</button>' : '') +
      '<button type="button" class="img-remove" data-img-remove="' + i + '">Remove</button>' +
      '</div></div>').join('') ||
      '<p class="empty-state">No images yet.</p>';
    list.querySelectorAll('[data-img-hero]').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.dataset.imgHero);
        if (i > 0) { imagesState.splice(0, 0, imagesState.splice(i, 1)[0]); renderImgList(); }
      };
    });
    list.querySelectorAll('[data-img-remove]').forEach(btn => {
      btn.onclick = () => { imagesState.splice(Number(btn.dataset.imgRemove), 1); renderImgList(); };
    });
  }

  function bindImgControls(isEdit) {
    const fileIn = document.getElementById('img-file');
    const uploadBtn = document.getElementById('img-upload');
    if (!fileIn || !uploadBtn) return;
    uploadBtn.onclick = () => fileIn.click();
    if (!isEdit) { fileIn.onchange = () => { fileIn.value = ''; }; return; }
    fileIn.onchange = () => {
      const file = fileIn.files && fileIn.files[0];
      fileIn.value = '';
      if (!file) return;
      const mime = file.type;
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
        window.NeoKesanAuth.showToast('Only JPEG, PNG, WebP or GIF images are allowed.');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        window.NeoKesanAuth.showToast('That image is larger than 2 MB — please resize it first.');
        return;
      }
      uploadBtn.disabled = true;
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result).split(',')[1] || '';
        window.NeoKesanAuth.apiFetch('products/' + encodeURIComponent(editing.slug) + '/image', { method: 'POST', body: { mime, data } })
          .then(res => {
            uploadBtn.disabled = false;
            if (res && res.url) {
              imagesState.push(res.url);
              renderImgList();
              window.NeoKesanAuth.showToast('Image uploaded');
            }
          })
          .catch(err => { uploadBtn.disabled = false; window.NeoKesanAuth.showToast(err.message || 'Upload failed.'); });
      };
      reader.onerror = () => { uploadBtn.disabled = false; window.NeoKesanAuth.showToast('Couldn\'t read that file.'); };
      reader.readAsDataURL(file);
    };
  }

  /* ----------------------- collect + save ----------------------- */

  function collectFeatures() {
    const out = [];
    document.querySelectorAll('[data-feat-row]').forEach(row => {
      const t = row.querySelector('[data-feat-title]').value.trim();
      const b = row.querySelector('[data-feat-body]').value.trim();
      if (t || b) out.push([t, b]);
    });
    return out;
  }

  function collectGuide(mode) {
    const panel = document.getElementById('guide-' + mode);
    if (!panel) return [];
    const stages = [];
    panel.querySelectorAll('[data-stage-row]').forEach(row => {
      const label = row.querySelector('[data-stage-label]').value.trim();
      const tds = row.querySelector('[data-stage-tds]').value.trim();
      const steps = row.querySelector('[data-stage-steps]').value.split('\n').map(s => s.trim()).filter(Boolean);
      const tdsPanel = [];
      row.querySelectorAll('[data-tds-row]').forEach(tr => {
        const range = tr.querySelector('[data-tds-range]').value.trim();
        const label2 = tr.querySelector('[data-tds-label]').value.trim();
        if (range || label2) tdsPanel.push({ range, label: label2 });
      });
      stages.push({ label, tds, steps, tdsPanel });
    });
    return stages;
  }

  function collectComposition() {
    const none = document.getElementById('comp-none');
    if (none && none.checked) return null;
    const container = document.getElementById('comp-parts');
    if (!container || container.classList.contains('hidden')) return null;
    const parts = [];
    // Attribute names must stay lowercase in the markup — the HTML parser
    // lowercases them, so a camelCase selector like [data-comp-ratioLabel]
    // would never match.
    const FIELDS = [
      ['id', 'comp-id'],
      ['name', 'comp-name'],
      ['desc', 'comp-desc'],
      ['note', 'comp-note'],
      ['ratio', 'comp-ratio'],
      ['ratioLabel', 'comp-ratiolabel'],
      ['ratioSub', 'comp-ratiosub'],
      ['tds', 'comp-tds'],
      ['tdsLabel', 'comp-tdslabel'],
    ];
    container.querySelectorAll('[data-comp-row]').forEach(row => {
      const part = {};
      FIELDS.forEach(([key, attr]) => {
        const el = row.querySelector('[data-' + attr + ']');
        if (el) part[key] = el.value.trim();
      });
      const elements = [];
      row.querySelectorAll('[data-el-row]').forEach(er => {
        const en = er.querySelector('[data-el-name]').value.trim();
        const ev = er.querySelector('[data-el-value]').value.trim();
        if (en || ev) elements.push([en, ev]);
      });
      part.elements = elements;
      if (part.id || part.name) parts.push(part);
    });
    return parts.length ? parts : null;
  }

  function onSaveProduct() {
    const isEdit = !!editing;
    const key = isEdit ? editing.slug : val('[data-key]');

    if (!val('[data-name]')) { window.NeoKesanAuth.showToast('Product name is required.'); return; }
    if (!isEdit && !/^[a-z0-9_-]+$/.test(key)) {
      window.NeoKesanAuth.showToast('Key must be lowercase letters, numbers, dashes or underscores.');
      return;
    }
    const price = val('[data-price]');
    if (price && !/^[0-9]+(\.[0-9]+)?$/.test(price)) {
      window.NeoKesanAuth.showToast('Price must be a number (e.g. 749 or 749.50).');
      return;
    }
    const accent = val('[data-accent]');
    const soft = val('[data-soft]');
    if (accent && !/^#[0-9a-fA-F]{3,8}$/.test(accent)) { window.NeoKesanAuth.showToast('Accent colour must be a hex code like #5546ae.'); return; }
    if (soft && !/^#[0-9a-fA-F]{3,8}$/.test(soft)) { window.NeoKesanAuth.showToast('Soft colour must be a hex code like #eeedfe.'); return; }

    const d = {
      name: val('[data-name]'),
      family: val('[data-family]'),
      category: val('[data-category]'),
      badge: val('[data-badge]'),
      word: val('[data-word]'),
      accent,
      soft,
      price,
      description: val('[data-description]'),
      formula: val('[data-formula]'),
      features: collectFeatures(),
      guide: { hydro: collectGuide('hydro'), soil: collectGuide('soil') },
      composition: collectComposition(),
      images: imagesState.slice()
    };
    // variants isn't in the form (product-page.js doesn't render it) — carry
    // any existing values through so an edit round-trips losslessly.
    if (isEdit && editing.data && Array.isArray(editing.data.variants)) d.variants = editing.data.variants;

    const status = val('[data-status]') || 'active';
    const asin = val('[data-asin]');
    const btn = document.getElementById('save-product');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';

    const promise = isEdit
      ? window.NeoKesanAuth.apiFetch('products/' + encodeURIComponent(key), { method: 'PUT', body: { data: d, status, asin } })
      : window.NeoKesanAuth.apiFetch('products', { method: 'POST', body: { key, status, asin, data: d } });

    promise
      .then(() => {
        window.NeoKesanAuth.showToast(isEdit ? 'Product updated' : 'Product created');
        editing = null;
        renderProductsTab(); // refetches the list and refreshes the catalog cache
      })
      .catch(err => {
        btn.disabled = false;
        btn.textContent = original;
        window.NeoKesanAuth.showToast(err.message || 'Couldn\'t save the product.');
      });
  }

  function slugify(str) {
    return String(str == null ? '' : str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /* ----------------------- delete (typed confirmation) ----------------------- */

  function openDeleteConfirm(p) {
    editing = null;
    const content = document.getElementById('tab-content');
    content.innerHTML =
      '<div class="admin-section" style="max-width:640px">' +
      '<h2>Delete “' + esc(p.name || p.slug) + '” permanently?</h2>' +
      '<p>This removes the product and deletes any images uploaded for it. Historical quiz results, product views and Amazon clicks that reference <b>' + esc(p.slug) + '</b> stay in your analytics, but the product will no longer appear on the site.</p>' +
      '<p class="danger-note">If you only want to take it off the site, choose <b>Archive</b> instead — you can restore it any time.</p>' +
      '<div class="confirm-box">Type <b>' + esc(p.slug) + '</b> to confirm' +
      '<input type="text" id="delete-confirm" placeholder="' + esc(p.slug) + '" autocomplete="off"></div>' +
      '<div class="form-actions inline">' +
      '<button type="button" class="button ghost" id="delete-cancel">Cancel</button>' +
      '<button type="button" class="button danger" id="delete-yes" disabled>Delete forever</button>' +
      '</div></div>';
    const confirmInput = document.getElementById('delete-confirm');
    const yes = document.getElementById('delete-yes');
    confirmInput.oninput = () => { yes.disabled = confirmInput.value !== p.slug; };
    document.getElementById('delete-cancel').onclick = () => renderProductsTab();
    yes.onclick = () => {
      yes.disabled = true;
      yes.textContent = 'Deleting…';
      window.NeoKesanAuth.apiFetch('products/' + encodeURIComponent(p.slug), { method: 'DELETE' })
        .then(() => {
          window.NeoKesanAuth.showToast('Product deleted');
          renderProductsTab();
        })
        .catch(err => { yes.disabled = false; yes.textContent = 'Delete forever'; window.NeoKesanAuth.showToast(err.message || 'Couldn\'t delete the product.'); });
    };
  }

  /* ----------------------- init ----------------------- */

  function init() {
    renderDashboard();
    window.addEventListener('authchange', renderDashboard);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
