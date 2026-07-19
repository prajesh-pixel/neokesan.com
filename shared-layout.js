const siteHeader = `<header class="nav-wrap"><nav class="nav shell"><a href="index.html" class="logo">neo<span>Kesan</span></a><div class="nav-links"><div class="home-product-dropdown"><a href="#products" class="shared-products-link">Products</a><div class="home-dropdown-panel"><a href="neobloom.html">NeoBloom <small>Flowering nutrition</small></a><a href="neoponic.html">NeoPonic <small>Hydroponic base nutrients</small></a><a href="neofolix.html">NeoFolix <small>Foliar nutrition</small></a></div></div><a href="index.html#learn">Learn</a><a href="index.html#how">How it works</a><a href="#about">About us</a><button class="cart-btn mobile-cart" type="button" aria-label="Shopping cart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Cart<b class="cart-badge">0</b></button></div><div class="actions"><button class="icon-button cart-btn" type="button" aria-label="Shopping cart"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 3C10.3432 3 9.00005 4.34315 9.00005 6H15C15 4.34315 13.6569 3 12 3ZM7.00005 6C7.00005 3.23858 9.23863 1 12 1C14.7615 1 17 3.23858 17 6H16.3441C16.7794 6.00005 17.1599 6.0013 17.4791 6.026C17.8369 6.05369 18.1919 6.11475 18.5417 6.27628C19.0471 6.50961 19.4776 6.87893 19.785 7.34294C19.9979 7.66418 20.1122 8.00569 20.194 8.35514C20.2709 8.68375 20.3324 9.08359 20.4031 9.54318L20.8541 12.4751C21.0468 13.7273 21.2014 14.7319 21.2546 15.5469C21.3091 16.3818 21.2669 17.1241 20.9938 17.8221C20.5817 18.8752 19.8247 19.7575 18.8465 20.325C18.1981 20.7011 17.4709 20.8556 16.6375 20.9287C15.8239 21 14.8074 21 13.5406 21H10.4595C9.19267 21 8.17621 21 7.36265 20.9287C6.52917 20.8556 5.80196 20.7011 5.15361 20.325C4.17539 19.7575 3.41842 18.8752 3.00631 17.8221C2.73317 17.1241 2.69104 16.3818 2.74554 15.5469C2.79873 14.732 2.9533 13.7273 3.14594 12.4752L3.59703 9.54315C3.66772 9.08358 3.72921 8.68375 3.80611 8.35514C3.88789 8.00569 4.0022 7.66418 4.21506 7.34294C4.52251 6.87893 4.953 6.50961 5.45837 6.27628C5.80824 6.11475 6.16316 6.05369 6.52098 6.026C6.84022 6.0013 7.22073 6.00005 7.656 6H7.00005ZM6.67528 8.02004C6.43801 8.0384 6.34578 8.06944 6.29671 8.09209C6.12826 8.16987 5.98476 8.29298 5.88228 8.44765C5.85243 8.4927 5.80772 8.57914 5.7535 8.81085C5.69635 9.05506 5.64603 9.3776 5.56836 9.88243L5.12984 12.7328C4.9284 14.0422 4.7881 14.9601 4.74129 15.6772C4.69513 16.3844 4.74974 16.789 4.86878 17.0932C5.11605 17.7251 5.57023 18.2545 6.15717 18.595C6.43973 18.7589 6.83136 18.8744 7.53736 18.9363C8.25323 18.9991 9.18181 19 10.5066 19H13.4935C14.8183 19 15.7469 18.9991 16.4627 18.9363C17.1687 18.8744 17.5604 18.7589 17.8429 18.595C18.4299 18.2545 18.884 17.7251 19.1313 17.0932C19.2504 16.789 19.305 16.3844 19.2588 15.6772C19.212 14.9601 19.0717 14.0422 18.8703 12.7328L18.4317 9.88243C18.3541 9.37761 18.3037 9.05507 18.2466 8.81085C18.1924 8.57914 18.1477 8.4927 18.1178 8.44765C18.0153 8.29298 17.8718 8.16987 17.7034 8.09209C17.6543 8.06944 17.5621 8.0384 17.3248 8.02004C17.0748 8.00069 16.7483 8 16.2376 8H7.76255C7.25178 8 6.92534 8.00069 6.67528 8.02004Z" fill="white"/></svg><b class="cart-badge">0</b></button><button class="button ghost auth-trigger">Sign in</button><div class="account-wrap"><a class="icon-button account-btn" href="account.html" aria-label="My account"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 11C14.4853 11 16.5 8.98528 16.5 6.5C16.5 4.01472 14.4853 2 12 2C9.51472 2 7.5 4.01472 7.5 6.5C7.5 8.98528 9.51472 11 12 11Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18.5714C5 16.0467 7.0467 14 9.57143 14H14.4286C16.9533 14 19 16.0467 19 18.5714C19 20.465 17.465 22 15.5714 22H8.42857C6.53502 22 5 20.465 5 18.5714Z" stroke="white" stroke-width="1.5"/></svg></a><div class="account-dropdown"><button class="signout-btn">Sign out</button></div></div></div><button class="menu" aria-label="Open menu">☰</button></nav></header>`;
const siteFooter = `<footer class="footer" id="about"><div class="shell footer-grid"><div><a href="index.html" class="logo">neo<span>Kesan</span></a><p>Precision nutrients for modern<br>Indian growers.</p></div><div><h4>Products</h4><a href="neoponic.html">NeoPonic A & B</a><a href="neobloom.html">NeoBloom</a><a href="neofolix.html">NeoFolix</a></div><div><h4>Learn</h4><a href="index.html#learn">Beginner guides</a><a href="index.html#learn">Video tutorials</a><a href="index.html#learn">Community</a></div><div><h4>Support</h4><a href="account.html">My account</a><a href="#about">Shipping</a><a href="#about">FAQs</a></div><div><h4>Find us</h4><div class="footer-map"><iframe src="https://www.openstreetmap.org/export/embed.html?bbox=72.7%2C18.9%2C73.1%2C19.2&amp;layer=mapnik&amp;marker=19.05%2C72.9" loading="lazy" title="neoKesan location"></iframe></div><div class="footer-social"><a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a><a href="#" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a><a href="#" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a></div></div></div><div class="shell copyright"><span>Copyright 2026 neoKesan. All rights reserved.</span><span>Made with care in India</span></div></footer>`;

function mountSharedLayout() {
  document.querySelectorAll('[data-site-header]').forEach(node => node.innerHTML = siteHeader);
  document.querySelectorAll('[data-site-footer]').forEach(node => node.innerHTML = siteFooter);

  /* Auth state UI */
  function updateAuthUI() {
    const isSignedIn = localStorage.getItem('neokesan_signedin') === 'true';
    document.querySelectorAll('.auth-trigger').forEach(btn => btn.style.display = isSignedIn ? 'none' : '');
    document.querySelectorAll('.account-wrap').forEach(wrap => wrap.style.display = isSignedIn ? '' : 'none');
  }
  updateAuthUI();
  window.addEventListener('authchange', updateAuthUI);

  /* Sign out */
  function handleSignOut() {
    localStorage.removeItem('neokesan_signedin');
    window.dispatchEvent(new Event('authchange'));
    if (window.location.href.includes('account.html')) window.location.href = 'index.html';
  }
  document.querySelectorAll('.signout-btn, .sidebar-signout').forEach(btn => btn.addEventListener('click', handleSignOut));

  document.querySelectorAll('.shared-products-link').forEach(link => {
    const holder = link.closest('.home-product-dropdown');
    link.onclick = event => { event.preventDefault(); holder.classList.toggle('open'); link.setAttribute('aria-expanded', holder.classList.contains('open')); };
    document.addEventListener('click', event => { if (!holder.contains(event.target)) holder.classList.remove('open'); });
  });
  document.querySelectorAll('.auth-trigger').forEach(button => button.addEventListener('click', () => {
    const modal = document.querySelector('#auth-modal');
    if (modal) modal.classList.add('open'); else window.location.href = 'account.html';
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

