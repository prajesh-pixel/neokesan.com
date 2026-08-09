/* neoKesan auth.js — Phase 4
 *
 * Owns account session state (JWT + cached profile + the neokesan_signedin flag
 * shared-layout.js reads for the header UI) and wires the #auth-modal OTP login,
 * the (gated) Google sign-in button, and the account.html profile page.
 *
 * Load order on both auth pages: shared-layout.js (defer) -> auth.js (defer) ->
 * script.js (defer). The top-level reconcile below runs before shared-layout's
 * updateAuthUI(), so the header reflects a token that already existed.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------- config */
  const API_BASE = 'https://shop.neokesan.com/wp-json/neokesan/v1/';

  // Google Identity Services Client ID (public by design — web Client IDs are
  // not secrets). https://console.cloud.google.com/apis/credentials
  const GOOGLE_CLIENT_ID = '100180570928-d0cs9ceqrqpu2obqfi41epmlmrk8tp8q.apps.googleusercontent.com';

  const SIGNED_IN_KEY = 'neokesan_signedin';
  const TOKEN_KEY = 'neokesan_token';
  const USER_KEY = 'neokesan_user';

  /* ------------------------------------------------------------- session */

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setSession(token, userData) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SIGNED_IN_KEY, 'true');
    if (userData) localStorage.setItem(USER_KEY, JSON.stringify(userData));
    window.dispatchEvent(new Event('authchange'));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.setItem(SIGNED_IN_KEY, 'false');
    window.dispatchEvent(new Event('authchange'));
  }

  // Reconcile the UI flag with the real gate (a stored token). Also fixes stale
  // 'true' flags left behind by the old script.js stubs.
  localStorage.setItem(SIGNED_IN_KEY, getToken() ? 'true' : 'false');

  // Scrub the token when shared-layout.js signs the user out (it removes the
  // flag, then dispatches authchange synchronously before redirecting).
  window.addEventListener('authchange', () => {
    if (localStorage.getItem(SIGNED_IN_KEY) !== 'true') {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  });

  /* ------------------------------------------------------------- API client */

  const FRIENDLY = {
    neokesan_invalid_email: "That email address doesn't look right. Please check and try again.",
    neokesan_otp_limit: 'Too many code requests — please wait a few minutes and try again.',
    neokesan_otp_missing: 'That code isn’t right. Please try again.',
    neokesan_otp_invalid: 'That code isn’t right. Please try again.',
    neokesan_otp_no_code: 'Please request a fresh code first.',
    neokesan_otp_too_many_attempts: 'Too many wrong attempts. Please request a new code.',
    neokesan_email_in_use: 'That email is already linked to another account.',
    neokesan_google_not_configured: 'Google sign-in isn’t ready yet — use email OTP for now.',
  };

  function friendlyMessage(code) {
    return FRIENDLY[code] || '';
  }

  function handleUnauthorized() {
    clearAuth();
    if (window.location.pathname.includes('account.html')) {
      window.location.replace('index.html?login=1');
    } else {
      openAuthModal();
      showToast('Your session has expired. Please sign in again.');
    }
  }

  // After signing in we stay on the current page; drop any ?login=1 that may
  // have bounced the user here so a refresh doesn't re-open the modal.
  function clearLoginParam() {
    const url = new URL(window.location.href);
    if (url.searchParams.has('login')) {
      url.searchParams.delete('login');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }

  // Small fetch wrapper around the neoKesan REST namespace. Authed GETs get a
  // cache-buster — Hostinger's CDN caches GET responses for 7 days. A 401 is
  // treated as an expired session (clear + prompt to sign in again).
  function apiFetch(path, opts) {
    opts = opts || {};
    const method = opts.method || 'GET';
    const token = opts.token || getToken();
    const headers = { 'Content-Type': 'application/json' };
    let url = API_BASE + path;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (method === 'GET' && token) url += (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
    const init = { method, headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(url, init).then(res =>
      res.json().catch(() => ({})).then(data => {
        if (res.ok) return data;
        const err = new Error(friendlyMessage(data.code) || data.message || 'Something went wrong. Please try again.');
        err.code = data.code;
        err.status = res.status;
        if (res.status === 401) handleUnauthorized();
        throw err;
      })
    );
  }

  /* ------------------------------------------------------------- toast */

  let toastTimer = null;
  function showToast(text) {
    let toast = document.querySelector('#toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  /* ------------------------------------------------------------- modal */

  function openAuthModal() {
    resetAuthModal();
    const modal = document.querySelector('#auth-modal');
    if (modal) modal.classList.add('open');
  }

  function closeAuthModal() {
    clearOtpTimer();
    const modal = document.querySelector('#auth-modal');
    if (modal) modal.classList.remove('open');
  }

  // Always reopen on the fresh start screen — hides the OTP screen, the Google
  // not-ready note, and clears the 6 code inputs.
  function resetAuthModal() {
    clearOtpTimer();
    const start = document.querySelector('#auth-start');
    const otpScreen = document.querySelector('#otp-screen');
    const note = document.querySelector('#google-coming-soon');
    if (start) start.classList.remove('hidden');
    if (otpScreen) otpScreen.classList.add('hidden');
    if (note) note.classList.add('hidden');
    document.querySelectorAll('.otp-row input').forEach(input => { input.value = ''; });
    updateVerifyState();
    primeGoogle();
  }

  /* ------------------------------------------------------------- OTP */

  const otpInputs = () => Array.from(document.querySelectorAll('.otp-row input'));

  function getOtpCode() {
    return otpInputs().map(input => input.value).join('').trim();
  }

  function updateVerifyState() {
    const btn = document.querySelector('#verify-otp');
    if (btn) btn.disabled = getOtpCode().length !== 6;
  }

  function isPhone(value) {
    // +91 98765 43210 / 9876543210 / 0987-654-3210 etc. — never an email.
    return /^\+?[0-9][0-9\s\-().]{7,17}$/.test(value);
  }

  function sendOtp() {
    const contact = document.querySelector('#auth-contact');
    const sendBtn = document.querySelector('#send-otp');
    const value = (contact.value || '').trim();
    if (!value) {
      contact.focus();
      showToast('Please enter your email address.');
      return;
    }
    if (isPhone(value)) {
      // Phone login is a future phase — gate it (this also protects the 10/IP/hr
      // send rate limit from a mistyped contact).
      showToast('SMS login is coming soon — use your email for now.');
      return;
    }
    const email = value.toLowerCase();
    const original = sendBtn.textContent;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    apiFetch('otp/send', { method: 'POST', body: { email } })
      .then(data => {
        if (data.dev_code) {
          // DEV ONLY — console only, never into the DOM or URL.
          console.log('[neoKesan DEV] OTP for', email, '=', data.dev_code);
        }
        const dest = document.querySelector('#otp-destination');
        if (dest) dest.textContent = email;
        document.querySelector('#auth-start').classList.add('hidden');
        document.querySelector('#otp-screen').classList.remove('hidden');
        startOtpTimer();
        const inputs = otpInputs();
        if (inputs[0]) inputs[0].focus();
      })
      .catch(err => showToast(err.message))
      .finally(() => { sendBtn.disabled = false; sendBtn.textContent = original; });
  }

  function verifyOtp() {
    const code = getOtpCode();
    if (code.length !== 6) {
      showToast('Enter the 6-digit code we sent you.');
      return;
    }
    const dest = document.querySelector('#otp-destination');
    const email = dest ? dest.textContent : '';
    const verifyBtn = document.querySelector('#verify-otp');
    const original = verifyBtn.textContent;
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying…';
    apiFetch('otp/verify', { method: 'POST', body: { email, code } })
      .then(data => {
        setSession(data.token, { email: data.email || email, user_id: data.user_id });
        closeAuthModal();
        clearLoginParam();
        showToast('Signed in — welcome back!');
      })
      .catch(err => {
        showToast(err.message);
        if (err.code === 'neokesan_otp_no_code' || err.code === 'neokesan_otp_too_many_attempts') {
          // The code is spent — bounce back to the start screen for a fresh one.
          clearOtpTimer();
          otpInputs().forEach(input => { input.value = ''; });
          document.querySelector('#otp-screen').classList.add('hidden');
          document.querySelector('#auth-start').classList.remove('hidden');
          updateVerifyState();
        }
      })
      .finally(() => { verifyBtn.disabled = false; verifyBtn.textContent = original; });
  }

  function setupOtpInputs() {
    const inputs = otpInputs();
    if (!inputs.length) return;
    inputs.forEach((input, index) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value && inputs[index + 1]) inputs[index + 1].focus();
        updateVerifyState();
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !input.value && inputs[index - 1]) {
          e.preventDefault();
          inputs[index - 1].focus();
        }
      });
    });
    const first = inputs[0];
    if (first) {
      first.addEventListener('paste', e => {
        e.preventDefault();
        const pasted = ((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, '').slice(0, 6);
        inputs.forEach((input, i) => { input.value = pasted[i] || ''; });
        updateVerifyState();
        inputs[Math.min(pasted.length, 5)].focus();
      });
    }
  }

  /* ------------------------------------------------------------- OTP timer */

  const OTP_EXPIRY_S = 600;     // matches the backend 600s code transient
  const RESEND_COOLDOWN_S = 30; // wait before you can ask for a fresh code

  let otpTimerId = null;
  let otpExpiresAt = 0;
  let resendReadyAt = 0;

  function formatClock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function stopOtpTimer() {
    if (otpTimerId) { clearInterval(otpTimerId); otpTimerId = null; }
  }

  function tickOtpTimer() {
    const now = Date.now();
    const expiryLeft = Math.max(0, Math.round((otpExpiresAt - now) / 1000));
    const resendLeft = Math.max(0, Math.ceil((resendReadyAt - now) / 1000));

    const timerEl = document.getElementById('otp-timer');
    const row = document.getElementById('otp-timer-row');
    if (timerEl) timerEl.textContent = formatClock(expiryLeft);
    if (row) row.classList.toggle('expired', expiryLeft === 0);

    const resendBtn = document.getElementById('resend-otp');
    if (resendBtn) {
      resendBtn.disabled = resendLeft > 0;
      resendBtn.textContent = resendLeft > 0
        ? 'Resend code (' + resendLeft + 's)'
        : (expiryLeft === 0 ? 'Request a new code' : 'Resend code');
    }

    if (expiryLeft === 0 && resendLeft === 0) stopOtpTimer();
  }

  // Start (or restart) the countdown after a code is sent.
  function startOtpTimer() {
    stopOtpTimer();
    otpExpiresAt = Date.now() + OTP_EXPIRY_S * 1000;
    resendReadyAt = Date.now() + RESEND_COOLDOWN_S * 1000;
    tickOtpTimer();
    otpTimerId = setInterval(tickOtpTimer, 1000);
  }

  // Reset the timer UI (modal closed, back pressed, code spent, fresh open).
  function clearOtpTimer() {
    stopOtpTimer();
    const timerEl = document.getElementById('otp-timer');
    if (timerEl) timerEl.textContent = formatClock(OTP_EXPIRY_S);
    const row = document.getElementById('otp-timer-row');
    if (row) row.classList.remove('expired');
    const resendBtn = document.getElementById('resend-otp');
    if (resendBtn) { resendBtn.disabled = false; resendBtn.textContent = 'Resend code'; }
  }

  /* ------------------------------------------------------------- Google (gated) */

  let gsiPromise = null;
  function loadGsi() {
    if (!gsiPromise) {
      gsiPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Could not load Google sign-in. Please try again.'));
        document.head.appendChild(s);
      });
    }
    return gsiPromise;
  }

  // Called when the auth modal opens so the invisible overlay is already in
  // place when the user first clicks the Google button (one-click flow, and the
  // popup opens from a direct user gesture rather than an async chain).
  function primeGoogle() {
    if (!GOOGLE_CLIENT_ID) return;
    loadGsi().then(ensureGsiOverlay).catch(() => {});
  }

  function onGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      // Not configured yet — never load GIS, never make a network call.
      const note = document.querySelector('#google-coming-soon');
      if (note) note.classList.remove('hidden');
      showToast('Google sign-in isn’t ready yet — use email OTP for now.');
      return;
    }
    // Fallback if the overlay isn't painted yet (e.g. GIS failed to load when
    // the modal opened): reload GIS and repaint. The invisible GIS button —
    // not this handler — opens the popup.
    loadGsi().then(ensureGsiOverlay).catch(err => showToast(err.message));
  }

  // Paint an invisible GIS button over the custom #google-signin button so
  // clicks reach Google and open the account chooser. renderButton must target
  // a SIBLING overlay div, never the custom button itself: GIS replaces the
  // target's contents with its own iframe, which would wipe our markup.
  function ensureGsiOverlay() {
    const wrap = document.getElementById('google-button-wrap');
    if (!wrap) return;
    let host = document.getElementById('gsi-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'gsi-host';
      wrap.appendChild(host);
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: gsiCallback,
      ux_mode: 'popup',
      auto_select: false,
    });
    try {
      window.google.accounts.id.renderButton(host, {
        type: 'standard', shape: 'pill', theme: 'outline', text: 'continue_with',
        width: host.offsetWidth || 280,
      });
    } catch (e) {
      // GIS refused to paint an overlay — open the one-tap prompt instead.
      window.google.accounts.id.prompt();
    }
  }

  function gsiCallback(response) {
    if (!response || !response.credential) {
      showToast('Google sign-in didn’t return a credential. Please try again.');
      return;
    }
    apiFetch('google', { method: 'POST', body: { id_token: response.credential } })
      .then(data => {
        setSession(data.token, { email: data.email, user_id: data.user_id });
        closeAuthModal();
        clearLoginParam();
        showToast('Signed in with Google!');
      })
      .catch(err => showToast(err.message))
      .finally(() => {
        try { window.google.accounts.id.disableAutoSelect(); } catch (e) { /* noop */ }
      });
  }

  /* ------------------------------------------------------------- account page */

  function cacheUser(user) {
    if (user && typeof user === 'object') localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.value = value;
  }

  function displayName(user) {
    const full = ((user.first_name || '') + ' ' + (user.last_name || '')).trim();
    return full || user.email || 'Garden grower';
  }

  function loadProfile() {
    apiFetch('profile', { method: 'GET' })
      .then(user => {
        cacheUser(user);
        const nameEl = document.getElementById('account-name');
        if (nameEl) nameEl.textContent = displayName(user);
        setFieldValue('first-name', user.first_name);
        setFieldValue('last-name', user.last_name);
        setFieldValue('profile-email', user.email);
        setFieldValue('profile-phone', user.phone);
        setFieldValue('profile-age', user.dob);
        setFieldValue('profile-language', user.language);
        setFieldValue('profile-growing-setup', user.growing_setup);
        setFieldValue('profile-crops', user.crops);
      })
      .catch(err => showToast(err.message));
  }

  function saveProfile() {
    const payload = {
      first_name: (document.getElementById('first-name') || {}).value || '',
      last_name: (document.getElementById('last-name') || {}).value || '',
      email: (document.getElementById('profile-email') || {}).value || '',
      phone: (document.getElementById('profile-phone') || {}).value || '',
      dob: (document.getElementById('profile-age') || {}).value || '',
      language: (document.getElementById('profile-language') || {}).value || '',
      growing_setup: (document.getElementById('profile-growing-setup') || {}).value || '',
      crops: (document.getElementById('profile-crops') || {}).value || '',
    };
    const form = document.getElementById('profile');
    const btn = form.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    apiFetch('profile', { method: 'POST', body: payload })
      .then(user => {
        cacheUser(user);
        const nameEl = document.getElementById('account-name');
        if (nameEl) nameEl.textContent = displayName(user);
        showToast('Profile saved');
      })
      .catch(err => showToast(err.message))
      .finally(() => { btn.disabled = false; btn.textContent = original; });
  }

  function setupAccountPage() {
    const profileForm = document.getElementById('profile');
    if (!profileForm) return;

    // Auth guard — no token means no account page.
    if (!getToken()) {
      window.location.replace('index.html?login=1');
      return;
    }

    loadProfile();

    profileForm.addEventListener('submit', e => {
      e.preventDefault();
      saveProfile();
    });
  }

  /* ------------------------------------------------------------- init */

  function setupAuthModal() {
    const modal = document.querySelector('#auth-modal');
    if (!modal) return;

    const close = () => modal.classList.remove('open');
    modal.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', close));
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    const sendBtn = document.querySelector('#send-otp');
    const verifyBtn = document.querySelector('#verify-otp');
    const resendBtn = document.querySelector('#resend-otp');
    const backBtn = document.querySelector('#otp-back');
    const googleBtn = document.querySelector('#google-signin');

    if (sendBtn) sendBtn.addEventListener('click', sendOtp);
    if (verifyBtn) verifyBtn.addEventListener('click', verifyOtp);
    if (resendBtn) resendBtn.addEventListener('click', () => {
      otpInputs().forEach(input => { input.value = ''; });
      updateVerifyState();
      sendOtp(); // stays on the OTP screen; clears inputs again on success
    });
    if (backBtn) backBtn.addEventListener('click', () => {
      clearOtpTimer();
      document.querySelector('#otp-screen').classList.add('hidden');
      document.querySelector('#auth-start').classList.remove('hidden');
    });
    if (googleBtn) googleBtn.addEventListener('click', onGoogleSignIn);

    setupOtpInputs();
    updateVerifyState();

    // Run AFTER shared-layout's open handler on the same click (registration
    // order): always open on the fresh start screen.
    document.querySelectorAll('.auth-trigger').forEach(btn => btn.addEventListener('click', resetAuthModal));
  }

  function init() {
    setupAuthModal();
    setupAccountPage();

    // index.html?login=1 (set when a session expires or an unauthenticated
    // visitor lands on the account page) -> open the sign-in modal.
    if (new URLSearchParams(window.location.search).get('login') === '1') {
      openAuthModal();
    }
  }

  // Public API for other page scripts. script.js uses these to gate the quiz
  // on sign-in and POST the answers back to the account profile.
  window.NeoKesanAuth = {
    isSignedIn: () => !!getToken(),
    getUser: () => {
      try {
        return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      } catch (e) {
        return null;
      }
    },
    openAuthModal,
    showToast,
    apiFetch,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
