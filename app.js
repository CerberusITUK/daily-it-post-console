import { CONFIG } from './config.js';

const elements = {
  authPanel: document.getElementById('auth-panel'),
  appPanel: document.getElementById('app-panel'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  usernameInput: document.getElementById('login-username'),
  passwordInput: document.getElementById('login-password'),
  logoutBtn: document.getElementById('logout-btn'),
  fetchArticlesBtn: document.getElementById('fetch-articles-btn'),
  articlesContainer: document.getElementById('articles-container'),
  articlesEmpty: document.getElementById('articles-empty'),
  articleTitle: document.getElementById('article-title'),
  articleMeta: document.getElementById('article-meta'),
  articleSummary: document.getElementById('article-summary'),
  articleLink: document.getElementById('article-link'),
  promptNotesInput: document.getElementById('prompt-notes-input'),
  runDraftBtn: document.getElementById('run-draft-btn'),
  redoStoryBtn: document.getElementById('redo-story-btn'),
  redoImageBtn: document.getElementById('redo-image-btn'),
  approveBtn: document.getElementById('approve-btn'),
  resultSummary: document.getElementById('result-summary'),
  resultHashtags: document.getElementById('result-hashtags'),
  resultImage: document.getElementById('result-image'),
  jobStatusPill: document.getElementById('job-status-pill'),
  jobLogList: document.getElementById('job-log-list'),
  clearLogBtn: document.getElementById('clear-log-btn'),
};

const articleTemplate = document.getElementById('article-item-template');

const state = {
  token: null,
  tokenExpiry: null,
  currentJobId: null,
  pollTimer: null,
  selectedArticle: null,
  articles: [],
  jobHistory: [],
};

const storageKey = 'daily-it-console-session';

function saveSession() {
  if (!state.token) {
    sessionStorage.removeItem(storageKey);
    return;
  }
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({ token: state.token, tokenExpiry: state.tokenExpiry })
  );
}

function restoreSession() {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.token && data.tokenExpiry && Date.now() < data.tokenExpiry) {
      state.token = data.token;
      state.tokenExpiry = data.tokenExpiry;
      showApp();
      return;
    }
  } catch (err) {
    console.warn('Failed to restore session', err);
  }
  sessionStorage.removeItem(storageKey);
}

function showApp() {
  elements.authPanel.classList.add('hidden');
  elements.appPanel.classList.remove('hidden');
}

function showAuth() {
  elements.appPanel.classList.add('hidden');
  elements.authPanel.classList.remove('hidden');
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);

  const res = await fetch(`${CONFIG.apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    logout();
    throw new Error('Unauthorised — please log in again');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function handleLogin(evt) {
  evt.preventDefault();
  elements.loginError.textContent = '';
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;
  if (!username || !password) return;

  try {
    const data = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });

    state.token = data.token;
    state.tokenExpiry = data.expiresAt;
    saveSession();
    showApp();
    addLog('Logged in successfully');
  } catch (err) {
    console.error(err);
    elements.loginError.textContent = err.message || 'Login failed';
  }
}

function logout() {
  state.token = null;
  state.tokenExpiry = null;
  saveSession();
  showAuth();
  resetUI();
}

function resetUI() {
  state.articles = [];
  state.selectedArticle = null;
  state.jobHistory = [];
  state.currentJobId = null;
  stopPolling();
  elements.articlesContainer.innerHTML = '';
  elements.articlesEmpty.classList.remove('hidden');
  renderArticleDetails();
  renderJobLog();
  updateButtons();
  updateJobStatus('Idle', 'muted');
}

async function fetchArticles() {
  if (!state.token) return;
  setLoading(elements.fetchArticlesBtn, true);
  try {
    const data = await apiFetch(`/api/articles?limit=${CONFIG.maxArticles}`);
    state.articles = data.articles || [];
    renderArticles();
    addLog(`Fetched ${state.articles.length} article(s)`);
  } catch (err) {
    addLog(`Failed to fetch articles: ${err.message}`, 'error');
  } finally {
    setLoading(elements.fetchArticlesBtn, false);
  }
}

function renderArticles() {
  elements.articlesContainer.innerHTML = '';
  if (!state.articles.length) {
    elements.articlesEmpty.classList.remove('hidden');
    return;
  }
  elements.articlesEmpty.classList.add('hidden');

  state.articles.forEach((article, idx) => {
    const clone = articleTemplate.content.cloneNode(true);
    const button = clone.querySelector('.article-item');
    button.dataset.index = idx;
    button.querySelector('.article-title').textContent = article.title || 'Untitled';
    button.querySelector('.article-source').textContent = article.source_name || 'Source';
    button.querySelector('.article-date').textContent = article.date || '';
    if (state.selectedArticle === idx) button.classList.add('active');
    button.addEventListener('click', () => selectArticle(idx));
    elements.articlesContainer.appendChild(clone);
  });
}

function selectArticle(index) {
  state.selectedArticle = index;
  renderArticles();
  renderArticleDetails();
  updateButtons();
  addLog(`Selected article: ${state.articles[index]?.title || 'Untitled'}`);
}

function renderArticleDetails() {
  const article = state.articles[state.selectedArticle] || null;
  if (!article) {
    elements.articleTitle.textContent = 'No article selected';
    elements.articleMeta.textContent = 'Pick a story from the left to begin.';
    elements.articleSummary.textContent = '';
    elements.articleLink.setAttribute('aria-disabled', 'true');
    elements.articleLink.removeAttribute('href');
    return;
  }
  elements.articleTitle.textContent = article.title;
  elements.articleMeta.textContent = `${article.source_name || 'Source'} · ${article.date || ''}`;
  elements.articleSummary.textContent = article.summary || 'No summary text available.';
  elements.articleLink.textContent = 'Open source article';
  elements.articleLink.setAttribute('href', article.link || '#');
  elements.articleLink.setAttribute('aria-disabled', article.link ? 'false' : 'true');
}

function updateButtons() {
  const hasArticle = state.selectedArticle !== null;
  elements.runDraftBtn.disabled = !hasArticle;
  elements.redoStoryBtn.disabled = !hasArticle;
  elements.redoImageBtn.disabled = !hasArticle;
  elements.approveBtn.disabled = !hasArticle;
}

function addLog(message, level = 'info') {
  const entry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toLocaleTimeString(),
    level,
    message,
  };
  state.jobHistory.unshift(entry);
  if (state.jobHistory.length > 40) state.jobHistory.pop();
  renderJobLog();
}

function renderJobLog() {
  elements.jobLogList.innerHTML = '';
  state.jobHistory.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `[${entry.timestamp}] ${entry.message}`;
    if (entry.level === 'error') li.style.color = 'var(--danger)';
    elements.jobLogList.appendChild(li);
  });
}

function setLoading(button, isLoading) {
  button.disabled = isLoading || button.disabled;
  button.dataset.loading = isLoading ? 'true' : 'false';
  if (isLoading) button.textContent = 'Working…';
  else button.textContent = button.dataset.resetText || button.textContent;
}

function updateJobStatus(text, variant = 'muted') {
  elements.jobStatusPill.textContent = text;
  elements.jobStatusPill.className = `pill ${variant}`;
}

async function triggerJob(action) {
  if (state.currentJobId) {
    addLog('A job is already running. Please wait.', 'error');
    return;
  }
  const article = state.articles[state.selectedArticle];
  if (!article) return;

  const payload = {
    action,
    article,
    promptNotes: elements.promptNotesInput.value.trim(),
  };

  try {
    addLog(`Starting job: ${action}`);
    updateJobStatus('Running', 'primary');
    const data = await apiFetch('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.currentJobId = data.jobId;
    startPolling();
  } catch (err) {
    addLog(`Job failed to start: ${err.message}`, 'error');
    updateJobStatus('Failed', 'danger');
  }
}

function startPolling() {
  stopPolling();
  pollJob();
  state.pollTimer = setInterval(pollJob, CONFIG.pollingIntervalMs);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function pollJob() {
  if (!state.currentJobId) return;
  try {
    const data = await apiFetch(`/api/jobs/${state.currentJobId}`);
    updateJobStatus(data.status, data.status === 'success' ? 'success' : 'primary');
    if (data.logs?.length) {
      data.logs.slice(-3).forEach((msg) => addLog(msg));
    }
    if (data.output) renderResults(data.output);
    if (['success', 'failed', 'cancelled'].includes(data.status)) {
      addLog(`Job ${data.status}`);
      stopPolling();
      state.currentJobId = null;
      if (data.status === 'failed') updateJobStatus('Failed', 'danger');
    }
  } catch (err) {
    addLog(`Polling error: ${err.message}`, 'error');
  }
}

function renderResults(output) {
  if (output.summary) {
    elements.resultSummary.textContent = output.summary;
    elements.resultSummary.classList.remove('muted');
  }
  if (output.hashtags) {
    elements.resultHashtags.textContent = output.hashtags.join(' ');
    elements.resultHashtags.classList.remove('muted');
  }
  if (output.image) {
    elements.resultImage.src = output.image;
    elements.resultImage.classList.add('visible');
  }
}

async function approveCurrent() {
  if (!state.currentJobId) {
    addLog('No draft job to approve. Run the AI draft first.', 'error');
    return;
  }
  try {
    await apiFetch(`/api/jobs/${state.currentJobId}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action: 'approve' }),
    });
    addLog('Approval sent to workflow');
  } catch (err) {
    addLog(`Approval failed: ${err.message}`, 'error');
  }
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutBtn.addEventListener('click', logout);
  elements.fetchArticlesBtn.addEventListener('click', fetchArticles);
  elements.runDraftBtn.addEventListener('click', () => triggerJob('draft'));
  elements.redoStoryBtn.addEventListener('click', () => triggerJob('redo'));
  elements.redoImageBtn.addEventListener('click', () => triggerJob('redo_image'));
  elements.approveBtn.addEventListener('click', approveCurrent);
  elements.clearLogBtn.addEventListener('click', () => {
    state.jobHistory = [];
    renderJobLog();
  });
}

bindEvents();
restoreSession();
