const quiz = [
  ['What are you growing?', [
    'Leafy vegetables & herbs (Spinach, Lettuce, Coriander, Mint, Basil, etc)',
    'Fruiting vegetables (Tomato, Strawberry, Brinjal, Cucumber, Capsicum, etc)',
    'Flowers & ornamental plants (Rose, Marigold, Lily, Indoor ornamentals)',
    'A mix of different plants',
  ]],
  ['How large is your growing area?', [
    'Small (A few pots or balcony garden)',
    'Medium (Home Garden or terrace garden; less than 25 sq. m)',
    'Large (Kitchen Garden or backyard; less than 100 sq. m)',
    'Farm or commercial cultivation (More than 100 sq. m)',
  ]],
  ['How are you growing your plants?', [
    'Soil-based (Pots, grow bags, or garden beds)',
    'Hydroponics',
    'Cocopeat or other soilless media',
    'Not sure / Other',
  ]],
  ['What is your main goal or challenge?', [
    'I want faster and healthier plant growth.',
    'I want more flowers and fruits.',
    'My plants have yellow leaves or poor growth.',
    'My plants are healthy—I want to keep them that way.',
  ]],
];

function setupQuiz() {
  const modal = document.querySelector('#quiz-modal');
  if (!modal) return;
  const auth = window.NeoKesanAuth;
  const question = document.querySelector('#question');
  const options = document.querySelector('#options');
  const next = document.querySelector('#next');
  const quizContent = document.querySelector('#quiz-content');
  const prompt = document.querySelector('#quiz-prompt');
  const result = document.querySelector('#result');
  const recommendation = document.querySelector('#recommendation');
  const resultNote = document.querySelector('#result-note');
  const quizBuy = document.querySelector('#quiz-buy');
  const promptCurrent = document.querySelector('#prompt-current');
  const promptYes = document.querySelector('#prompt-yes');
  const promptNo = document.querySelector('#prompt-no');
  const retakeBtn = document.querySelector('#retake-btn');
  let current = 0;
  let selected = null;
  let answers = [];
  let pendingQuiz = false;
  let existing = null; // the stored recommendation when we're just re-showing it

  function render() {
    selected = null;
    next.disabled = true;
    next.textContent = current === quiz.length - 1 ? 'See recommendation' : 'Next';
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

  // Hide the other modal steps and start the questions from the top.
  function showQuestions() {
    result.classList.add('hidden');
    if (prompt) prompt.classList.add('hidden');
    quizContent.classList.remove('hidden');
    current = 0;
    answers = [];
    render();
  }

  // Render a recommendation — from a fresh submit or from the stored one.
  function showResult(rec) {
    quizContent.classList.add('hidden');
    if (prompt) prompt.classList.add('hidden');
    result.classList.remove('hidden');
    recommendation.textContent = rec.title;
    quizBuy.innerHTML = '';
    (rec.products || []).forEach(product => {
      const row = document.createElement('div');
      row.style.cssText = 'border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px';
      const name = document.createElement('b');
      name.style.cssText = 'font-size:13px;color:var(--ink);line-height:1.4';
      name.textContent = product.name;
      const buy = document.createElement('a');
      buy.className = 'button primary';
      buy.href = product.url;
      buy.target = '_blank';
      buy.rel = 'noopener';
      buy.dataset.key = product.key;
      buy.textContent = 'Buy on Amazon →';
      buy.onclick = () => recordAmazonClick(product);
      row.append(name, buy);
      quizBuy.append(row);
    });
    resultNote.textContent = rec.attempt_no
      ? `Attempt ${rec.attempt_no} of your quiz — buying on Amazon is saved to your account.`
      : 'Tap to buy on Amazon — your choice is saved to your account.';
    if (retakeBtn) retakeBtn.style.display = 'block';
  }

  // Open the quiz. Users who already have a recommendation are asked first
  // whether they want to change it; everyone else goes straight to the questions.
  function openQuiz() {
    existing = null;
    quizContent.classList.add('hidden');
    result.classList.add('hidden');
    if (prompt) prompt.classList.add('hidden');
    modal.classList.add('open');
    auth.apiFetch('quiz')
      .then(data => {
        if (data && data.attempts_count >= 1 && data.current) {
          existing = data.current;
          if (promptCurrent) promptCurrent.textContent = existing.title;
          if (prompt) prompt.classList.remove('hidden');
        } else {
          showQuestions();
        }
      })
      .catch(() => showQuestions()); // no saved quiz yet / fetch hiccup → ask fresh
  }

  // Submit all four answers to the backend. The server computes and stores the
  // recommendation, so the displayed result is always the authoritative one.
  function submitAnswers() {
    next.disabled = true;
    next.textContent = 'Saving…';
    auth.apiFetch('quiz', { method: 'POST', body: { answers } })
      .then(rec => {
        if (!rec || !(rec.products || []).length) throw new Error('No recommendation returned.');
        showResult(rec);
      })
      .catch(err => {
        next.disabled = false;
        next.textContent = 'See recommendation';
        auth.showToast((err && err.message) || 'Could not save your answers — please try again.');
      });
  }

  // Fire-and-forget log of the chosen product; never blocks the Amazon tab.
  function recordAmazonClick(product) {
    auth.apiFetch('quiz/click', { method: 'POST', body: { key: product.key } })
      .then(() => auth.showToast('Choice saved to your account'))
      .catch(() => {});
  }

  document.querySelectorAll('.quiz-trigger').forEach(button => button.onclick = event => {
    event.stopPropagation(); // don't flip a story card the button sits inside
    if (auth && !auth.isSignedIn()) {
      pendingQuiz = true; // drop them into the quiz right after a successful sign-in
      auth.openAuthModal();
      auth.showToast('Sign in first — your quiz results will be saved to your account.');
      return;
    }
    openQuiz();
  });

  // The sign-in modal closes itself on success; open the quiz right after.
  window.addEventListener('authchange', () => {
    if (pendingQuiz && auth && auth.isSignedIn()) {
      pendingQuiz = false;
      setTimeout(openQuiz, 0);
    }
  });

  // A dismissed sign-in modal shouldn't leave a stale "resume quiz" intent.
  const authModal = document.querySelector('#auth-modal');
  if (authModal) {
    authModal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', () => { pendingQuiz = false; }));
    authModal.addEventListener('click', e => { if (e.target === authModal) pendingQuiz = false; });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pendingQuiz = false; });

  modal.querySelectorAll('.modal-close').forEach(button => button.onclick = () => modal.classList.remove('open'));
  modal.onclick = event => { if (event.target === modal) modal.classList.remove('open'); };
  next.onclick = () => {
    if (selected === null) return;
    answers.push(selected);
    if (++current === quiz.length) submitAnswers();
    else render();
  };

  if (promptYes) promptYes.onclick = () => showQuestions();
  if (promptNo) promptNo.onclick = () => existing && showResult(existing);
  if (retakeBtn) retakeBtn.onclick = () => openQuiz();
}

function setupAccount() {
  const profile = document.querySelector('#profile');
  if (!profile) return;
  const toast = document.querySelector('#toast');
  const showToast = text => { toast.textContent = text; toast.classList.add('visible'); setTimeout(() => toast.classList.remove('visible'), 2200); };
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
  const routes = { 'NeoPonic A & B Full Set': 'neoponic.html', 'NeoBloom X1, X2 & X3 Full Set': 'neobloom.html', 'NeoFolix X1 & X2 Full Set': 'neofolix.html', 'NeoPonic A & B': 'neoponic.html', 'NeoBloom X1': 'neobloom.html', 'NeoBloom X2': 'neobloom.html', 'NeoFolix X1 & X2': 'neofolix.html' };
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

function setupCarousels() {
  document.querySelectorAll('.product-carousel').forEach(carousel => {
    const slides = carousel.querySelectorAll('.carousel-slide');
    const prev = carousel.querySelector('.carousel-prev');
    const next = carousel.querySelector('.carousel-next');
    let current = 0;
    function show(idx) {
      slides.forEach(s => s.classList.remove('active'));
      current = (idx + slides.length) % slides.length;
      slides[current].classList.add('active');
    }
    if (prev) prev.onclick = e => { e.stopPropagation(); show(current - 1); };
    if (next) next.onclick = e => { e.stopPropagation(); show(current + 1); };
  });
}

function setupStoryCards() {
  document.querySelectorAll('.story').forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => { orderHomepageSections(); setupHomepageProductDropdown(); setupProductCardLinks(); setupCarousels(); setupQuiz(); setupAccount(); setupStoryCards(); });

