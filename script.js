const quiz = [
  ['What best describes your current setup?', ['Complete beginner at home', 'Hobbyist with a small setup', 'Serious home grower', 'Commercial grower']],
  ['What do you mainly grow?', ['Leafy greens and herbs', 'Fruits and vegetables', 'Flowers and ornamentals', 'A mix of everything']],
  ['Which system do you use?', ['Kratky / passive growing', 'DWC or NFT', 'Coco / soil-less media', 'I am not sure yet']],
  ['What is your biggest challenge?', ['Getting started', 'Slow or pale growth', 'Poor flowering', 'Inconsistent yields']]
];

function setupQuiz() {
  const modal = document.querySelector('#quiz-modal');
  if (!modal) return;
  const question = document.querySelector('#question');
  const options = document.querySelector('#options');
  const next = document.querySelector('#next');
  let current = 0;
  let selected = null;

  function render() {
    selected = null;
    next.disabled = true;
    question.textContent = quiz[current][0];
    options.innerHTML = '';
    quiz[current][1].forEach(text => {
      const button = document.createElement('button');
      button.className = 'option';
      button.textContent = text;
      button.onclick = () => {
        document.querySelectorAll('.option').forEach(item => item.classList.remove('selected'));
        button.classList.add('selected');
        selected = text;
        next.disabled = false;
      };
      options.append(button);
    });
    document.querySelector('#step').textContent = `${current + 1} of ${quiz.length}`;
    document.querySelector('#bar').style.width = `${(current + 1) / quiz.length * 100}%`;
  }
  document.querySelectorAll('.quiz-trigger').forEach(button => button.onclick = () => {
    current = 0;
    document.querySelector('#quiz-content').classList.remove('hidden');
    document.querySelector('#result').classList.add('hidden');
    render();
    modal.classList.add('open');
  });
  modal.querySelectorAll('.modal-close').forEach(button => button.onclick = () => modal.classList.remove('open'));
  modal.onclick = event => { if (event.target === modal) modal.classList.remove('open'); };
  next.onclick = () => {
    if (selected === null) return;
    if (++current === quiz.length) {
      document.querySelector('#quiz-content').classList.add('hidden');
      document.querySelector('#result').classList.remove('hidden');
    } else render();
  };
}

function setupAuthentication() {
  const modal = document.querySelector('#auth-modal');
  if (!modal) return;
  const start = document.querySelector('#auth-start');
  const otpScreen = document.querySelector('#otp-screen');
  const contact = document.querySelector('#auth-contact');
  const otpInputs = [...document.querySelectorAll('.otp-row input')];
  const close = () => modal.classList.remove('open');
  document.querySelectorAll('.auth-trigger').forEach(button => button.onclick = () => modal.classList.add('open'));
  modal.querySelectorAll('.modal-close').forEach(button => button.onclick = close);
  modal.onclick = event => { if (event.target === modal) close(); };
  document.querySelector('#send-otp').onclick = () => {
    if (!contact.value.trim()) { contact.focus(); return; }
    document.querySelector('#otp-destination').textContent = contact.value.trim();
    start.classList.add('hidden'); otpScreen.classList.remove('hidden'); otpInputs[0].focus();
  };
  document.querySelector('#otp-back').onclick = () => { otpScreen.classList.add('hidden'); start.classList.remove('hidden'); };
  otpInputs.forEach((input, index) => input.addEventListener('input', () => { if (input.value && otpInputs[index + 1]) otpInputs[index + 1].focus(); }));
  document.querySelector('#verify-otp').onclick = () => window.location.href = 'account.html';
  document.querySelector('#google-signin').onclick = () => window.location.href = 'account.html';
  document.querySelector('#resend-otp').onclick = () => alert('A new demo code has been sent. Connect this button to your OTP provider before launch.');
}

function setupAccount() {
  const profile = document.querySelector('#profile');
  if (!profile) return;
  const toast = document.querySelector('#toast');
  const showToast = text => { toast.textContent = text; toast.classList.add('visible'); setTimeout(() => toast.classList.remove('visible'), 2200); };
  profile.onsubmit = event => { event.preventDefault(); showToast('Profile saved successfully'); };
  const addressForm = document.querySelector('#address-form');
  document.querySelector('#add-address').onclick = () => addressForm.classList.toggle('hidden');
  addressForm.onsubmit = event => {
    event.preventDefault();
    const label = document.querySelector('#address-label').value || 'Delivery address';
    const name = document.querySelector('#address-name').value || 'Account holder';
    const street = document.querySelector('#address-street').value;
    const city = document.querySelector('#address-city').value;
    const state = document.querySelector('#address-state').value;
    const pin = document.querySelector('#address-pin').value;
    const list = document.querySelector('#address-list');
    list.innerHTML = `<article class="address-card"><b>${label}</b>${name}<br>${street}<br>${city}, ${state} ${pin}</article>`;
    addressForm.reset(); addressForm.classList.add('hidden'); showToast('Address saved successfully');
  };
}

function orderHomepageSections() {
  const products = document.querySelector('#products');
  const quizBanner = document.querySelector('.quiz')?.parentElement;
  const how = document.querySelector('#how');
  if (products && quizBanner && how) products.before(quizBanner, how);
}

function setupHomepageProductDropdown() {
  if (document.querySelector('.shared-products-link')) return;
  const productLink = document.querySelector('.nav-links a[href="#products"]');
  if (!productLink) return;
  const holder = document.createElement('div');
  holder.className = 'home-product-dropdown';
  productLink.parentNode.insertBefore(holder, productLink);
  holder.append(productLink);
  const panel = document.createElement('div');
  panel.className = 'home-dropdown-panel';
  panel.innerHTML = '<a href="neobloom.html">NeoBloom <small>Flowering nutrition</small></a><a href="neoponic.html">NeoPonic <small>Hydroponic base nutrients</small></a><a href="neofolix.html">NeoFolix <small>Foliar nutrition</small></a>';
  holder.append(panel);
  productLink.setAttribute('aria-expanded', 'false');
  productLink.onclick = event => { event.preventDefault(); holder.classList.toggle('open'); productLink.setAttribute('aria-expanded', holder.classList.contains('open')); };
  document.addEventListener('click', event => { if (!holder.contains(event.target)) holder.classList.remove('open'); });
}

function setupProductCardLinks() {
  const routes = { 'NeoPonic A & B': 'neoponic.html', 'NeoBloom X1': 'neobloom.html', 'NeoBloom X2': 'neobloom.html', 'NeoFolix X1 & X2': 'neofolix.html' };
  document.querySelectorAll('.product').forEach(card => {
    const title = card.querySelector('h3')?.textContent;
    if (!routes[title]) return;
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    const open = () => window.location.href = routes[title];
    card.onclick = open;
    card.onkeydown = event => { if (event.key === 'Enter') open(); };
  });
}

document.addEventListener('DOMContentLoaded', () => { orderHomepageSections(); setupHomepageProductDropdown(); setupProductCardLinks(); setupQuiz(); setupAuthentication(); setupAccount(); });

