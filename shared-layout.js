const siteHeader = `<header class="nav-wrap"><nav class="nav shell"><a href="index.html" class="logo">neo<span>Kesan</span></a><div class="nav-links"><div class="home-product-dropdown"><a href="#products" class="shared-products-link">Products</a><div class="home-dropdown-panel"><a href="neobloom.html">NeoBloom <small>Flowering nutrition</small></a><a href="neoponic.html">NeoPonic <small>Hydroponic base nutrients</small></a><a href="neofolix.html">NeoFolix <small>Foliar nutrition</small></a></div></div><a href="index.html#learn">Learn</a><a href="index.html#how">How it works</a><a href="#about">About us</a></div><div class="actions"><a class="icon-button" href="account.html" aria-label="My account"><span aria-hidden="true">&#9787;</span></a><button class="button ghost auth-trigger">Sign in / Register</button><button class="icon-button" type="button" aria-label="Shopping cart"><span aria-hidden="true">&#128722;</span><b class="cart-badge">0</b></button></div><button class="menu" aria-label="Open menu">☰</button></nav></header>`;
const siteFooter = `<footer class="footer" id="about"><div class="shell footer-grid"><div><a href="index.html" class="logo">neo<span>Kesan</span></a><p>Precision nutrients for modern<br>Indian growers.</p></div><div><h4>Products</h4><a href="neoponic.html">NeoPonic A & B</a><a href="neobloom.html">NeoBloom</a><a href="neofolix.html">NeoFolix</a></div><div><h4>Learn</h4><a href="index.html#learn">Beginner guides</a><a href="index.html#learn">Video tutorials</a><a href="index.html#learn">Community</a></div><div><h4>Support</h4><a href="account.html">My account</a><a href="#about">Shipping</a><a href="#about">FAQs</a></div><div><h4>Find us</h4><div class="footer-map"><iframe src="https://www.openstreetmap.org/export/embed.html?bbox=72.7%2C18.9%2C73.1%2C19.2&amp;layer=mapnik&amp;marker=19.05%2C72.9" loading="lazy" title="neoKesan location"></iframe></div><div class="footer-social"><a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a><a href="#" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a><a href="#" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a></div></div></div><div class="shell copyright"><span>Copyright 2026 neoKesan. All rights reserved.</span><span>Made with care in India</span></div></footer>`;

function mountSharedLayout() {
  document.querySelectorAll('[data-site-header]').forEach(node => node.innerHTML = siteHeader);
  document.querySelectorAll('[data-site-footer]').forEach(node => node.innerHTML = siteFooter);
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

