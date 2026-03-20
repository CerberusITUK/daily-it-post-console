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
  resultStory: document.getElementById('result-story'),
  resultHashtags: document.getElementById('result-hashtags'),
  resultImage: document.getElementById('result-image'),
  imagePlaceholder: document.getElementById('image-placeholder'),
  jobStatusPill: document.getElementById('job-status-pill'),
  jobLogList: document.getElementById('job-log-list'),
  clearLogBtn: document.getElementById('clear-log-btn'),
  
  // Story Modal elements
  storyModal: document.getElementById('story-modal'),
  storyModalTitle: document.getElementById('story-modal-title'),
  storyModalSource: document.getElementById('story-modal-source'),
  storyModalSummary: document.getElementById('story-modal-summary'),
  storyModalLink: document.getElementById('story-modal-link'),
  storyModalClose: document.getElementById('story-modal-close'),
  storyModalSendBtn: document.getElementById('story-modal-send-btn'),
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
  hiddenArticles: new Set(JSON.parse(localStorage.getItem('hiddenArticles') || '[]')),
  postedArticles: new Set(JSON.parse(localStorage.getItem('postedArticles') || '[]')),
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
  elements.resultStory.textContent = 'AI is writing the story...';
  elements.resultStory.classList.add('muted');
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
    // If not the login path, automatically force logout so they know they need to sign in again
    if (!path.includes('/api/login')) {
      state.token = null;
      state.tokenExpiry = null;
      localStorage.removeItem('console_session');
      showAuth();
      addLog('Session expired. Please log in again.', 'error');
      alert('Your session has expired. Please log in again.');
    }
    throw new Error('Unauthorized');
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
    
    // Filter out hidden articles from incoming payload *before* appending to state
    const visibleIncoming = incoming.filter(article => !state.hiddenArticles.has(article.link));
    
    state.articles = append ? [...state.articles, ...visibleIncoming] : visibleIncoming;
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

function hideArticle(index, event) {
  event.stopPropagation();
  const article = state.articles[index];
  if (article && article.link) {
    state.hiddenArticles.add(article.link);
    localStorage.setItem('hiddenArticles', JSON.stringify([...state.hiddenArticles]));
  }
  // Remove from current view
  state.articles.splice(index, 1);
  if (state.selectedArticle === index) {
    state.selectedArticle = null;
  } else if (state.selectedArticle !== null && state.selectedArticle > index) {
    state.selectedArticle--;
  }
  renderArticles();
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
    const hideBtn = clone.querySelector('.hide-btn');
    const sendToAiBtn = clone.querySelector('.send-to-ai-btn');
    const postedBadge = clone.querySelector('.posted-badge');
    
    button.dataset.index = idx;
    button.querySelector('.article-title').textContent = article.title || 'Untitled';
    button.querySelector('.article-source').textContent = article.source_name || 'Source';
    button.querySelector('.article-date').textContent = article.date || '';
    
    if (state.selectedArticle === idx) button.classList.add('active');
    
    if (article.link && state.postedArticles.has(article.link)) {
      button.classList.add('posted');
      postedBadge.classList.remove('hidden');
    }
    
    // Clicking anywhere on the card opens the story modal
    const wrapper = clone.querySelector('.article-item-wrapper');
    wrapper.addEventListener('click', (e) => {
      // Don't open modal if clicking the send to AI button or hide button
      if (e.target.closest('.send-to-ai-btn') || e.target.closest('.hide-btn')) return;
      openStoryModal(idx);
    });
    
    sendToAiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectArticleAndDraft(idx);
    });
    
    hideBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideArticle(idx, e);
    });
    
    elements.articlesContainer.appendChild(clone);
  });
}

function openStoryModal(index) {
  const article = state.articles[index];
  if (!article) return;
  
  state.selectedArticle = index;
  
  elements.storyModalTitle.textContent = article.title || 'Untitled';
  elements.storyModalSource.textContent = article.source_name || 'Source';
  elements.storyModalSummary.textContent = article.summary || 'No summary available.';
  
  if (article.link) {
    elements.storyModalLink.href = article.link;
    elements.storyModalLink.style.display = 'inline-block';
  } else {
    elements.storyModalLink.style.display = 'none';
  }
  
  elements.storyModal.classList.remove('hidden');
  elements.storyModal.setAttribute('aria-hidden', 'false');
  elements.storyModal.removeAttribute('inert');
  
  // Set up the Send to AI button
  elements.storyModalSendBtn.onclick = () => {
    closeStoryModal();
    selectArticleAndDraft(index);
  };
}

function closeStoryModal() {
  elements.storyModal.classList.add('hidden');
  elements.storyModal.setAttribute('aria-hidden', 'true');
  elements.storyModal.setAttribute('inert', '');
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
    previousResult: action === 'redo_image' && state.lastResult ? state.lastResult : undefined,
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
  if (output.story) {
    elements.resultStory.textContent = output.story;
    elements.resultStory.classList.remove('muted');
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
    
    // Once approved, mark as posted and clear state so they can pick a new article
    if (state.lastArticlePayload && state.lastArticlePayload.link) {
      state.postedArticles.add(state.lastArticlePayload.link);
      localStorage.setItem('postedArticles', JSON.stringify([...state.postedArticles]));
    }
    
    state.lastResultJobId = null;
    state.lastResult = null;
    state.lastArticlePayload = null;
    saveSession();
    updateButtons();
    renderArticles(); // Re-render to show posted badge
    
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
  
  // Modal handlers
  elements.storyModalClose.addEventListener('click', closeStoryModal);
  elements.storyModal.addEventListener('click', (e) => {
    if (e.target === elements.storyModal) closeStoryModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.storyModal.classList.contains('hidden')) {
      closeStoryModal();
    }
  });
}

bindEvents();
restoreSession();
