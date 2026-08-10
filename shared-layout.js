const siteHeader = `<header class="nav-wrap"><nav class="nav shell"><a href="index.html" class="logo"><img src="assets/logo.png" alt="neoKesan" class="header-logo-img"></a><div class="nav-links"><div class="home-product-dropdown"><a href="#products" class="shared-products-link">Products</a><div class="home-dropdown-panel"><a href="product.html?key=bloom">NeoBloom <small>Flowering nutrition</small></a><a href="product.html?key=ponic">NeoPonic <small>Hydroponic base nutrients</small></a><a href="product.html?key=folix">NeoFolix <small>Foliar nutrition</small></a></div></div><a href="index.html#learn">Learn</a><a href="index.html#how">How it works</a><a style="display:none">Consultancy</a><a href="#about">About us</a></div><div class="actions"><button class="icon-button cart-btn" style="display:none" type="button" aria-label="Shopping cart"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 3C10.3432 3 9.00005 4.34315 9.00005 6H15C15 4.34315 13.6569 3 12 3ZM7.00005 6C7.00005 3.23858 9.23863 1 12 1C14.7615 1 17 3.23858 17 6H16.3441C16.7794 6.00005 17.1599 6.0013 17.4791 6.026C17.8369 6.05369 18.1919 6.11475 18.5417 6.27628C19.0471 6.50961 19.4776 6.87893 19.785 7.34294C19.9979 7.66418 20.1122 8.00569 20.194 8.35514C20.2709 8.68375 20.3324 9.08359 20.4031 9.54318L20.8541 12.4751C21.0468 13.7273 21.2014 14.7319 21.2546 15.5469C21.3091 16.3818 21.2669 17.1241 20.9938 17.8221C20.5817 18.8752 19.8247 19.7575 18.8465 20.325C18.1981 20.7011 17.4709 20.8556 16.6375 20.9287C15.8239 21 14.8074 21 13.5406 21H10.4595C9.19267 21 8.17621 21 7.36265 20.9287C6.52917 20.8556 5.80196 20.7011 5.15361 20.325C4.17539 19.7575 3.41842 18.8752 3.00631 17.8221C2.73317 17.1241 2.69104 16.3818 2.74554 15.5469C2.79873 14.732 2.9533 13.7273 3.14594 12.4752L3.59703 9.54315C3.66772 9.08358 3.72921 8.68375 3.80611 8.35514C3.88789 8.00569 4.0022 7.66418 4.21506 7.34294C4.52251 6.87893 4.953 6.50961 5.45837 6.27628C5.80824 6.11475 6.16316 6.05369 6.52098 6.026C6.84022 6.0013 7.22073 6.00005 7.656 6H7.00005ZM6.67528 8.02004C6.43801 8.0384 6.34578 8.06944 6.29671 8.09209C6.12826 8.16987 5.98476 8.29298 5.88228 8.44765C5.85243 8.4927 5.80772 8.57914 5.7535 8.81085C5.69635 9.05506 5.64603 9.3776 5.56836 9.88243L5.12984 12.7328C4.9284 14.0422 4.7881 14.9601 4.74129 15.6772C4.69513 16.3844 4.74974 16.789 4.86878 17.0932C5.11605 17.7251 5.57023 18.2545 6.15717 18.595C6.43973 18.7589 6.83136 18.8744 7.53736 18.9363C8.25323 18.9991 9.18181 19 10.5066 19H13.4935C14.8183 19 15.7469 18.9991 16.4627 18.9363C17.1687 18.8744 17.5604 18.7589 17.8429 18.595C18.4299 18.2545 18.884 17.7251 19.1313 17.0932C19.2504 16.789 19.305 16.3844 19.2588 15.6772C19.212 14.9601 19.0717 14.0422 18.8703 12.7328L18.4317 9.88243C18.3541 9.37761 18.3037 9.05507 18.2466 8.81085C18.1924 8.57914 18.1477 8.4927 18.1178 8.44765C18.0153 8.29298 17.8718 8.16987 17.7034 8.09209C17.6543 8.06944 17.5621 8.0384 17.3248 8.02004C17.0748 8.00069 16.7483 8 16.2376 8H7.76255C7.25178 8 6.92534 8.00069 6.67528 8.02004Z" fill="white"/></svg><b class="cart-badge">0</b></button><button class="mobile-cart" style="display:none" type="button" aria-label="Shopping cart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Cart<b class="cart-badge">0</b></button><button class="button ghost auth-trigger" style="display:none">Sign in</button><a class="icon-button admin-btn" href="admin.html" aria-label="Admin dashboard" title="Admin dashboard" style="display:none"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" stroke="white" stroke-width="1.5"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a><div class="account-wrap"><a class="icon-button account-btn" href="account.html" aria-label="My account"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 11C14.4853 11 16.5 8.98528 16.5 6.5C16.5 4.01472 14.4853 2 12 2C9.51472 2 7.5 4.01472 7.5 6.5C7.5 8.98528 9.51472 11 12 11Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18.5714C5 16.0467 7.0467 14 9.57143 14H14.4286C16.9533 14 19 16.0467 19 18.5714C19 20.465 17.465 22 15.5714 22H8.42857C6.53502 22 5 20.465 5 18.5714Z" stroke="white" stroke-width="1.5"/></svg></a><div class="account-dropdown"><button class="signout-btn">Sign out</button></div></div></div><button class="menu" aria-label="Open menu">☰</button></nav></header>`;
const siteFooter = `<footer class="footer" id="about"><div class="shell footer-grid"><div><a href="index.html" class="logo footer-brand"><img src="assets/logo.png" alt="neoKesan" class="footer-logo-img"><span class="footer-brand-text">neo<span>Kesan</span></span></a><p>Precision nutrients for modern<br>Indian growers.</p></div><div><h4>Products</h4><a href="product.html?key=ponic">NeoPonic A &amp; B <small>Full Set</small></a><a href="product.html?key=bloom">NeoBloom X1, X2 &amp; X3 <small>Full Set</small></a><a href="product.html?key=folix">NeoFolix X1 &amp; X2 <small>Full Set</small></a></div><div style="display:none"><h4>Learn</h4><a href="index.html#learn">Beginner guides</a><a href="index.html#learn">Video tutorials</a><a href="index.html#learn">Community</a></div><div><h4>Support</h4><a href="#about">Shipping</a><a href="#about">FAQs</a></div><div><h4>Find us</h4><div class="footer-map"><iframe src="https://www.openstreetmap.org/export/embed.html?bbox=87.5665%2C21.9897%2C87.9665%2C22.2897&amp;layer=mapnik&amp;marker=22.1397%2C87.7665" loading="lazy" title="neoKesan location"></iframe></div><div class="footer-social"><a href="https://www.linkedin.com/company/neokesan/posts/?feedView=all" target="_blank" rel="noopener" aria-label="LinkedIn"><svg viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg></a></div></div></div><div class="shell copyright"><span>Copyright 2026 neoKesan. All rights reserved.</span><span>Made with care in India</span></div></footer>`;

// Escape user-supplied product fields before they touch the DOM (same helper as
// script.js — kept local so the two files stay independent).
function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mountSharedLayout() {
  console.log('[neoKesan] shared-layout v20260811a');
  document.querySelectorAll('[data-site-header]').forEach(node => node.innerHTML = siteHeader);
  document.querySelectorAll('[data-site-footer]').forEach(node => node.innerHTML = siteFooter);

  /* Live prices from assets/live-prices.js (fall back to hardcoded values) */
  document.querySelectorAll('[data-price-key]').forEach(el => {
    const key = el.dataset.priceKey;
    const live = window.NEOKESAN_PRICES && window.NEOKESAN_PRICES[key];
    if (live) el.textContent = '₹' + live;
  });

  /* Auth state UI */
  // Read the shared session flag once, safely. localStorage is the single source
  // of truth for the session (auth.js sets it on sign-in, this file on sign-out),
  // so the header's only job is to mirror whatever is stored.
  function getSignedIn() {
    try { return localStorage.getItem('neokesan_signedin') === 'true'; } catch (e) { return false; }
  }
  // The signed-in user's admin status is only known server-side (the JWT has no
  // role claim and require_admin() checks WP's manage_options capability), so we
  // probe an admin-gated endpoint once per session. A 200 means the admin button
  // shows; 403/401/network means it stays hidden.
  const API_BASE = 'https://shop.neokesan.com/wp-json/neokesan/v1/';
  let adminChecked = false; // guard: probe at most once per signed-in session
  function checkAdminStatus() {
    if (adminChecked) return;
    let token = null;
    try { token = localStorage.getItem('neokesan_token'); } catch (e) {}
    if (!token) return;
    adminChecked = true; // set before the fetch so the 1s poll never re-fires it
    fetch(API_BASE + 'admin/stats?cb=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + token } })
      .then(res => document.querySelectorAll('.admin-btn').forEach(btn => btn.style.display = res.ok ? '' : 'none'))
      .catch(() => {}); // network hiccup -> button stays hidden, retried next sign-in
  }
  let lastSignedIn = null; // guard: only touch the DOM when the state actually changed
  function updateAuthUI() {
    const isSignedIn = getSignedIn();
    if (isSignedIn === lastSignedIn) return;
    lastSignedIn = isSignedIn;
    document.querySelectorAll('.auth-trigger').forEach(btn => btn.style.display = isSignedIn ? 'none' : '');
    document.querySelectorAll('.account-wrap').forEach(wrap => wrap.style.display = isSignedIn ? '' : 'none');
    if (isSignedIn) {
      checkAdminStatus();
    } else {
      adminChecked = false; // reset so the next sign-in gets a fresh probe
      document.querySelectorAll('.admin-btn').forEach(btn => btn.style.display = 'none');
    }
  }
  updateAuthUI();
  window.addEventListener('authchange', updateAuthUI);
  // Re-sync whenever this page is shown again. Browser back/forward cache
  // (bfcache) restores a page from memory WITHOUT re-running scripts, so a page
  // whose session changed elsewhere would otherwise keep a stale signed-in
  // header. pageshow fires on every display, including bfcache restores.
  window.addEventListener('pageshow', updateAuthUI);
  // And across open tabs: signing out (or in) in one tab is the same session for
  // every other tab of this origin, so the header must follow along.
  window.addEventListener('storage', event => {
    if (event.key === null || event.key === 'neokesan_signedin' || event.key === 'neokesan_token' || event.key === 'neokesan_user') {
      updateAuthUI();
    }
  });
  // When a background tab comes back to the foreground, re-check the flag. This
  // catches tab switches where the storage event is dropped by the browser (a
  // known quirk with locally-opened files) yet the session changed elsewhere.
  window.addEventListener('focus', updateAuthUI);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateAuthUI(); });
  // Last-resort safety net: a light self-healing poll. On a single-origin HTTPS
  // site the events above are enough, but on file:// pages cross-tab storage
  // events can be unreliable. Reading one key per second is free, and
  // updateAuthUI no-ops unless the signed-in state actually changed, so this is
  // guaranteed to converge within a second on every page and every open tab.
  setInterval(updateAuthUI, 1000);

  /* Sign out */
  function handleSignOut() {
    // Clear the full session here (not just the UI flag): auth.js scrubs the
    // token on authchange, but product pages don't load auth.js, so leaving the
    // token behind would log the user back in on the next page load.
    try {
      localStorage.removeItem('neokesan_signedin');
      localStorage.removeItem('neokesan_token');
      localStorage.removeItem('neokesan_user');
    } catch (e) {}
    window.dispatchEvent(new Event('authchange'));
    if (window.location.href.includes('account.html')) window.location.href = 'index.html';
  }
  document.querySelectorAll('.signout-btn, .sidebar-signout').forEach(btn => btn.addEventListener('click', handleSignOut));

  document.querySelectorAll('.shared-products-link').forEach(link => {
    const holder = link.closest('.home-product-dropdown');
    link.onclick = event => { event.preventDefault(); holder.classList.toggle('open'); link.setAttribute('aria-expanded', holder.classList.contains('open')); };
    document.addEventListener('click', event => { if (!holder.contains(event.target)) holder.classList.remove('open'); });
  });

  // Repopulate the Products dropdown from the catalog. The static links above
  // stay until this resolves (nav never blank); once the fresh list lands,
  // every product the admin saved shows here.
  if (window.NeoKesanCatalog && typeof window.NeoKesanCatalog.load === 'function') {
    window.NeoKesanCatalog.load().then(entries => {
      const items = (Array.isArray(entries) ? entries : []).filter(e => e && e.slug && e.data && typeof e.data === 'object');
      if (!items.length) return;
      const links = items.map(e => {
        const d = e.data;
        const label = (d.name || e.name || e.slug) + (d.family ? ' ' + d.family : '');
        const sub = d.category || '';
        return `<a href="product.html?key=${encodeURIComponent(e.slug)}">${esc(label)}${sub ? ` <small>${esc(sub)}</small>` : ''}</a>`;
      }).join('');
      document.querySelectorAll('.home-dropdown-panel').forEach(panel => { panel.innerHTML = links; });
    }).catch(() => {});
  }
  document.querySelectorAll('.auth-trigger').forEach(button => button.addEventListener('click', () => {
    const modal = document.querySelector('#auth-modal');
    if (modal) modal.classList.add('open'); else window.location.href = 'index.html?login=1';
  }));
  /* Mobile menu toggle */
  const nav = document.querySelector('.nav');
  const menuBtn = document.querySelector('.menu');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      nav.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-label', nav.classList.contains('nav-open') ? 'Close menu' : 'Open menu');
    });
    document.addEventListener('click', e => {
      if (!nav.contains(e.target)) nav.classList.remove('nav-open');
    });
    nav.querySelectorAll('.nav-links a:not(.shared-products-link)').forEach(link => link.addEventListener('click', () => nav.classList.remove('nav-open')));
  }
}
document.addEventListener('DOMContentLoaded', mountSharedLayout);

