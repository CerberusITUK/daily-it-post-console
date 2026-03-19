import { CONFIG } from './config.js';

const elements = {
  authPanel: document.getElementById('auth-panel'),
  appPanel: document.getElementById('app-panel'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  usernameInput: document.getElementById('login-username'),
  passwordInput: document.getElementById('login-password'),
  logoutBtn: document.getElementById('logout-btn'),
  
  // Views
  viewList: document.getElementById('view-list'),
  viewPreview: document.getElementById('view-preview'),
  backToListBtn: document.getElementById('back-to-list-btn'),
  
  // List View elements
  fetchArticlesBtn: document.getElementById('fetch-articles-btn'),
  loadMoreBtn: document.getElementById('load-more-btn'),
  articlesContainer: document.getElementById('articles-container'),
  articlesEmpty: document.getElementById('articles-empty'),
  
  // Preview View elements
  articleLink: document.getElementById('article-link'),
  promptNotesInput: document.getElementById('prompt-notes-input'),
  redoStoryBtn: document.getElementById('redo-story-btn'),
  redoImageBtn: document.getElementById('redo-image-btn'),
  approveBtn: document.getElementById('approve-btn'),
  resultSummary: document.getElementById('result-summary'),
  resultHashtags: document.getElementById('result-hashtags'),
  resultImage: document.getElementById('result-image'),
  imagePlaceholder: document.getElementById('image-placeholder'),
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
  articleOffset: 0,
  hasMoreArticles: false,
  jobHistory: [],
};

const storageKey = 'daily-it-console-session';

function saveSession() {
  if (!state.token) {
    sessionStorage.removeItem(storageKey);
    return;
  }
  const payload = {
    token: state.token,
    tokenExpiry: state.tokenExpiry,
    lastResultJobId: state.lastResultJobId,
    lastResult: state.lastResult,
    lastArticlePayload: state.lastArticlePayload,
  };
  sessionStorage.setItem(storageKey, JSON.stringify(payload));
}

function restoreSession() {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.token && data.tokenExpiry && Date.now() < data.tokenExpiry) {
      state.token = data.token;
      state.tokenExpiry = data.tokenExpiry;
      state.lastResultJobId = data.lastResultJobId || null;
      state.lastResult = data.lastResult || null;
      state.lastArticlePayload = data.lastArticlePayload || null;
      showApp();
      if (state.lastResult) {
        showPreviewView();
        renderResults(state.lastResult);
        updateJobStatus('Ready', 'success');
        addLog('Restored last draft result from previous session');
        
        // Restore article link if we have the payload
        if (state.lastArticlePayload && state.lastArticlePayload.link) {
          elements.articleLink.setAttribute('href', state.lastArticlePayload.link);
          elements.articleLink.setAttribute('aria-disabled', 'false');
        }
      }
      updateButtons();
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
  showListView();
}

function showAuth() {
  elements.appPanel.classList.add('hidden');
  elements.authPanel.classList.remove('hidden');
}

function showListView() {
  elements.viewPreview.classList.add('hidden');
  elements.viewList.classList.remove('hidden');
  
  // Clear preview state when going back to list
  if (!state.currentJobId && !state.lastResultJobId) {
    clearPreview();
  }
}

function showPreviewView() {
  elements.viewList.classList.add('hidden');
  elements.viewPreview.classList.remove('hidden');
}

function clearPreview() {
  elements.resultSummary.textContent = 'AI is generating the summary...';
  elements.resultSummary.classList.add('muted');
  elements.resultHashtags.textContent = '';
  elements.resultHashtags.classList.add('muted');
  elements.resultImage.src = '';
  elements.resultImage.classList.remove('visible');
  elements.imagePlaceholder.classList.remove('hidden');
  elements.articleLink.setAttribute('aria-disabled', 'true');
  elements.articleLink.removeAttribute('href');
  elements.promptNotesInput.value = '';
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
    
    // Auto-fetch articles on login
    fetchArticles();
  } catch (err) {
    console.error(err);
    elements.loginError.textContent = err.message || 'Login failed';
  }
}

function logout() {
  state.token = null;
  state.tokenExpiry = null;
  state.lastResultJobId = null;
  state.lastResult = null;
  state.lastArticlePayload = null;
  saveSession();
  showAuth();
  resetUI();
}

function resetUI() {
  state.articles = [];
  state.selectedArticle = null;
  state.articleOffset = 0;
  state.hasMoreArticles = false;
  state.jobHistory = [];
  state.currentJobId = null;
  stopPolling();
  state.lastResultJobId = null;
  state.lastResult = null;
  state.lastArticlePayload = null;
  elements.articlesContainer.innerHTML = '';
  elements.articlesEmpty.classList.remove('hidden');
  updateLoadMoreVisibility();
  clearPreview();
  renderJobLog();
  updateButtons();
  updateJobStatus('Idle', 'muted');
  showListView();
}

function updateLoadMoreVisibility() {
  if (!state.articles.length || !state.hasMoreArticles) {
    elements.loadMoreBtn.classList.add('hidden');
  } else {
    elements.loadMoreBtn.classList.remove('hidden');
  }
}

async function fetchArticles(options = {}) {
  if (!state.token) return;
  const { append = false } = options;
  const button = append ? elements.loadMoreBtn : elements.fetchArticlesBtn;
  setLoading(button, true);
  try {
    const offset = append ? state.articleOffset : 0;
    if (!append) {
      state.selectedArticle = null;
      state.articleOffset = 0;
      state.hasMoreArticles = false;
    }

    const params = new URLSearchParams({
      limit: '20', // Updated to 20 per request
      offset: String(offset),
    });
    const data = await apiFetch(`/api/articles?${params.toString()}`);
    const incoming = data.articles || [];

    state.articleOffset = offset + incoming.length;
    state.hasMoreArticles = Boolean(data.hasMore);
    state.articles = append ? [...state.articles, ...incoming] : incoming;
    renderArticles();
    updateLoadMoreVisibility();
    const logMsg = append
      ? `Loaded ${incoming.length} more article(s)`
      : `Fetched ${state.articles.length} article(s)`;
    addLog(logMsg);
  } catch (err) {
    addLog(`Failed to fetch articles: ${err.message}`, 'error');
  } finally {
    setLoading(button, false);
  }
}

async function loadMoreArticles() {
  await fetchArticles({ append: true });
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
    button.addEventListener('click', () => selectArticleAndDraft(idx));
    elements.articlesContainer.appendChild(clone);
  });
}

function selectArticleAndDraft(index) {
  state.selectedArticle = index;
  const article = state.articles[index];
  if (!article) return;

  // Setup preview UI for new draft
  clearPreview();
  if (article.link) {
    elements.articleLink.setAttribute('href', article.link);
    elements.articleLink.setAttribute('aria-disabled', 'false');
  }
  
  // Switch to preview view
  showPreviewView();
  
  // Automatically trigger the draft job
  triggerJob('draft');
  
  addLog(`Selected and drafting: ${article.title || 'Untitled'}`);
}

function updateButtons() {
  const hasResult = state.lastResultJobId !== null;
  elements.redoStoryBtn.disabled = !hasResult && !state.currentJobId;
  elements.redoImageBtn.disabled = !hasResult && !state.currentJobId;
  elements.approveBtn.disabled = !hasResult;
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
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.resetText) {
      button.dataset.resetText = button.textContent;
    }
    button.disabled = true;
    button.dataset.loading = 'true';
    button.textContent = 'Working…';
  } else {
    button.disabled = false;
    button.dataset.loading = 'false';
    if (button.dataset.resetText) {
      button.textContent = button.dataset.resetText;
    }
  }
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
  
  // For 'draft', we use selectedArticle. For redos, we use lastArticlePayload.
  let articlePayload;
  if (action === 'draft') {
    const article = state.articles[state.selectedArticle];
    if (!article) return;
    articlePayload = JSON.parse(JSON.stringify(article));
  } else {
    if (!state.lastArticlePayload) {
      addLog('No article context available for redo.', 'error');
      return;
    }
    articlePayload = state.lastArticlePayload;
  }

  const payload = {
    action,
    article: articlePayload,
    promptNotes: elements.promptNotesInput.value.trim(),
  };

  try {
    addLog(`Starting job: ${action}`);
    updateJobStatus('Running', 'primary');
    
    // Clear results UI while running a redo
    if (action === 'redo' || action === 'draft') {
      elements.resultSummary.textContent = 'AI is generating the summary...';
      elements.resultSummary.classList.add('muted');
      elements.resultHashtags.textContent = '';
    }
    if (action === 'redo_image' || action === 'redo' || action === 'draft') {
      elements.resultImage.classList.remove('visible');
      elements.imagePlaceholder.classList.remove('hidden');
    }

    updateButtons();

    const data = await apiFetch('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    state.currentJobId = data.jobId;
    state.pendingArticle = articlePayload;
    startPolling();
  } catch (err) {
    addLog(`Job failed to start: ${err.message}`, 'error');
    updateJobStatus('Failed', 'danger');
    updateButtons();
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
    if (data.output) {
      renderResults(data.output);
    }

    if (['success', 'failed', 'cancelled'].includes(data.status)) {
      if (data.status === 'success' && data.output) {
        state.lastResultJobId = state.currentJobId;
        state.lastResult = data.output;
        state.lastArticlePayload = state.pendingArticle;
        saveSession();
      }

      addLog(`Job ${data.status}`);
      stopPolling();
      state.currentJobId = null;
      state.pendingArticle = null;
      updateButtons();

      if (data.status === 'failed') {
        updateJobStatus('Failed', 'danger');
      }
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
    elements.resultHashtags.textContent = Array.isArray(output.hashtags) ? output.hashtags.join(' ') : output.hashtags;
    elements.resultHashtags.classList.remove('muted');
  }
  if (output.image) {
    elements.resultImage.src = output.image;
    elements.resultImage.classList.add('visible');
    elements.imagePlaceholder.classList.add('hidden');
  }
}

async function approveCurrent() {
  if (state.currentJobId) {
    addLog('Job still running. Wait for it to finish before approving.', 'error');
    return;
  }
  if (!state.lastResultJobId) {
    addLog('No draft job to approve. Run an AI draft first.', 'error');
    return;
  }
  
  setLoading(elements.approveBtn, true);
  try {
    await apiFetch(`/api/jobs/${state.lastResultJobId}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'approve',
        result: state.lastResult,
        article: state.lastArticlePayload || {},
      }),
    });
    addLog('Approval sent to workflow successfully', 'success');
    
    // Once approved, clear state so they can pick a new article
    state.lastResultJobId = null;
    state.lastResult = null;
    state.lastArticlePayload = null;
    saveSession();
    updateButtons();
    
    // Automatically take them back to the list
    setTimeout(() => {
      showListView();
    }, 1500);
    
  } catch (err) {
    addLog(`Approval failed: ${err.message}`, 'error');
  } finally {
    setLoading(elements.approveBtn, false);
  }
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutBtn.addEventListener('click', logout);
  elements.fetchArticlesBtn.addEventListener('click', () => fetchArticles());
  elements.loadMoreBtn.addEventListener('click', loadMoreArticles);
  elements.backToListBtn.addEventListener('click', showListView);
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
