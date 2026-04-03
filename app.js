/**
 * StudyAI — app.js
 * Handles routing, state, and all AI API integrations.
 */
'use strict';

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
const STATE = {
  page: 'dashboard',
  keys: { openai: '', perplexity: '', anthropic: '', wolfram: '' },
  subjects: [],
  sessions: { total: 0, today: 0, streak: 0 },

  // Per-AI conversation histories
  chats: { chatgpt: [], perplexity: [], claude: [] },

  // Claude writing
  writing: { mode: 'essay', input: '', output: '' },

  // Flashcard decks: { id, name, cards: [{id,q,a,status}] }
  decks: [],
  activeDeck: null,
  studyCardIdx: 0,

  // Wolfram history
  wolframHistory: [],

  // Misc
  loading: {},
  pdfContext: null,    // Parsed PDF text for Perplexity
};

/* ═══════════════════════════════════════════════════════
   PERSISTENCE
═══════════════════════════════════════════════════════ */
function save() {
  const persisted = {
    keys:          STATE.keys,
    subjects:      STATE.subjects,
    sessions:      STATE.sessions,
    chats:         STATE.chats,
    decks:         STATE.decks,
    wolframHistory:STATE.wolframHistory,
    writing:       STATE.writing,
  };
  localStorage.setItem('studyai_state', JSON.stringify(persisted));
}

function load() {
  try {
    const raw = localStorage.getItem('studyai_state');
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.assign(STATE.keys, data.keys || {});
    STATE.subjects       = data.subjects       || [];
    STATE.sessions       = data.sessions       || { total: 0, today: 0, streak: 0 };
    STATE.chats          = data.chats          || { chatgpt: [], perplexity: [], claude: [] };
    STATE.decks          = data.decks          || [];
    STATE.wolframHistory = data.wolframHistory  || [];
    STATE.writing        = data.writing        || { mode: 'essay', input: '', output: '' };
  } catch(e) { console.warn('Failed to load state:', e); }
}

/* ═══════════════════════════════════════════════════════
   ROUTER
═══════════════════════════════════════════════════════ */
function navigate(page) {
  STATE.page = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  renderPage(page);
}

function renderPage(page) {
  const container = document.getElementById('page-container');
  container.innerHTML = '';
  const renders = {
    dashboard:  renderDashboard,
    chatgpt:    renderChatGPT,
    perplexity: renderPerplexity,
    claude:     renderClaude,
    flashcards: renderFlashcards,
    wolfram:    renderWolfram,
    settings:   renderSettings,
  };
  (renders[page] || renderDashboard)();
  updateStatusDots();
}

/* ═══════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function toast(msg, type = 'info', duration = 3500) {
  const icons = { info: '◈', success: '✔', error: '✖' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('exiting');
    setTimeout(() => el.remove(), 280);
  }, duration);
}

function showModal(content) {
  document.getElementById('modal-content').innerHTML = content;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function renderMarkdown(text) {
  if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
  const result = marked.parse(text || '');
  return result;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function highlightCode(el) {
  if (typeof hljs !== 'undefined') {
    el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  }
}

function renderMath(el) {
  if (typeof renderMathInElement !== 'undefined') {
    try {
      renderMathInElement(el, {
        delimiters: [
          {left:'$$',right:'$$',display:true},
          {left:'$',right:'$',display:false},
          {left:'\\[',right:'\\]',display:true},
          {left:'\\(',right:'\\)',display:false}
        ],
        throwOnError: false
      });
    } catch(e) {}
  }
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}

function updateStatusDots() {
  const map = {
    'status-gpt':    STATE.keys.openai,
    'status-perp':   STATE.keys.perplexity,
    'status-claude': STATE.keys.anthropic,
    'status-wolfram':STATE.keys.wolfram,
  };
  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('active', !!key);
  });
}

function studyTimeTick() {
  STATE.sessions.today = (STATE.sessions.today || 0) + 1;
  STATE.sessions.total = (STATE.sessions.total || 0) + 1;
  save();
}

/* ═══════════════════════════════════════════════════════
   API CALLS
═══════════════════════════════════════════════════════ */
async function apiOpenAI(messages, model = 'gpt-4o', systemPrompt = null) {
  if (!STATE.keys.openai) throw new Error('OpenAI API key not set. Go to Settings → API Keys.');
  const msgs = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;
  const resp = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: STATE.keys.openai, model, messages: msgs, max_tokens: 2048 })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `OpenAI error ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

async function apiPerplexity(messages, model = 'llama-3.1-sonar-large-128k-online') {
  if (!STATE.keys.perplexity) throw new Error('Perplexity API key not set. Go to Settings → API Keys.');
  const resp = await fetch('/api/perplexity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: STATE.keys.perplexity,
      model,
      messages,
      max_tokens: 2048,
      return_citations: true,
      return_related_questions: false
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Perplexity error ${resp.status}`);
  }
  const data = await resp.json();
  return { content: data.choices[0].message.content, citations: data.citations || [] };
}

async function apiAnthropic(messages, systemPrompt = '') {
  if (!STATE.keys.anthropic) throw new Error('Anthropic API key not set. Go to Settings → API Keys.');
  const resp = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: STATE.keys.anthropic,
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Anthropic error ${resp.status}`);
  }
  const data = await resp.json();
  return data.content[0].text;
}

async function apiWolfram(query) {
  if (!STATE.keys.wolfram) throw new Error('Wolfram Alpha App ID not set. Go to Settings → API Keys.');
  const params = new URLSearchParams({ apiKey: STATE.keys.wolfram, query });
  const resp = await fetch(`/api/wolfram?${params}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error || `Wolfram error ${resp.status}`);
  }
  return await resp.json();
}

async function parsePDF(file) {
  const form = new FormData();
  form.append('pdf', file);
  const resp = await fetch('/api/parse-pdf', { method: 'POST', body: form });
  if (!resp.ok) throw new Error('Failed to parse PDF');
  return await resp.json();
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════ */
function renderDashboard() {
  const container = document.getElementById('page-container');
  const totalCards = STATE.decks.reduce((s, d) => s + d.cards.length, 0);
  const knownCards = STATE.decks.reduce((s, d) => s + d.cards.filter(c => c.status === 'known').length, 0);
  const studyMin = Math.floor((STATE.sessions.total || 0) / 60);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <div class="page-label">
          <span class="label-dot" style="background:var(--col-gold)"></span>
          Your Workspace
        </div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Organize your studies and launch AI tools</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openAddSubject()">+ New Subject</button>
      </div>
    </div>

    <div class="page-body">
      <!-- Stats -->
      <div class="dashboard-grid">
        <div class="card stat-card">
          <span class="stat-icon">📚</span>
          <span class="stat-val">${STATE.subjects.length}</span>
          <span class="stat-label">Active Subjects</span>
        </div>
        <div class="card stat-card">
          <span class="stat-icon">🃏</span>
          <span class="stat-val">${totalCards}</span>
          <span class="stat-label">Flashcards (${knownCards} known)</span>
        </div>
        <div class="card stat-card">
          <span class="stat-icon">⏱</span>
          <span class="stat-val">${studyMin}</span>
          <span class="stat-label">Minutes Studied</span>
        </div>
      </div>

      <!-- Subjects -->
      <div class="dash-section-title">
        <span>Subjects</span>
        <button class="btn btn-ghost btn-sm" onclick="openAddSubject()">+ Add</button>
      </div>
      <div class="subjects-grid" id="subjects-grid">
        ${renderSubjectCards()}
        <div class="card add-subject-card" onclick="openAddSubject()">
          <span class="add-icon">+</span>
          <span class="add-label">New Subject</span>
        </div>
      </div>

      <!-- AI Tools -->
      <div class="dash-section-title">AI Study Tools</div>
      <div class="ai-tools-grid">
        ${[
          { page:'chatgpt',    icon:'GPT', name:'ChatGPT',    desc:'General Q&A', col:'--col-gpt' },
          { page:'perplexity', icon:'P',   name:'Perplexity', desc:'Research',    col:'--col-perp' },
          { page:'claude',     icon:'C',   name:'Claude',     desc:'Writing',     col:'--col-claude' },
          { page:'flashcards', icon:'F',   name:'Flashcards', desc:'Memorize',    col:'--col-turbo' },
          { page:'wolfram',    icon:'∑',   name:'Wolfram',    desc:'Math',        col:'--col-wolfram' },
        ].map(t => `
          <div class="card ai-tool-card card-hoverable" onclick="navigate('${t.page}')" style="--tool-color:var(${t.col})">
            <div class="tool-icon">${t.icon}</div>
            <div class="tool-name">${t.name}</div>
            <div class="tool-desc">${t.desc}</div>
          </div>
        `).join('')}
      </div>

      <!-- Recent decks -->
      ${STATE.decks.length > 0 ? `
        <div class="dash-section-title">
          <span>Recent Flashcard Decks</span>
          <button class="btn btn-ghost btn-sm" onclick="navigate('flashcards')">View All →</button>
        </div>
        <div class="decks-row">
          ${STATE.decks.slice(-5).map(d => `
            <div class="deck-chip" onclick="navigate('flashcards')">
              ${d.name}
              <span class="deck-count">${d.cards.length}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderSubjectCards() {
  if (!STATE.subjects.length) return '';
  return STATE.subjects.map(subj => `
    <div class="card subject-card card-hoverable" style="--subj-color:${subj.color || 'var(--col-accent)'}">
      <div class="subj-actions">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteSubject('${subj.id}')">✕</button>
      </div>
      <span class="subj-icon">${subj.icon || '📖'}</span>
      <div class="subj-name">${escapeHtml(subj.name)}</div>
      <div class="subj-count">${subj.notes ? subj.notes.length + ' notes' : 'No notes yet'}</div>
    </div>
  `).join('');
}

function openAddSubject() {
  showModal(`
    <div class="modal-title">Add New Subject</div>
    <div class="flex flex-col gap-3">
      <div>
        <label class="api-key-label" style="margin-bottom:6px">Subject Name</label>
        <input type="text" id="subj-name" placeholder="e.g. Linear Algebra" class="w-full" style="width:100%" />
      </div>
      <div>
        <label class="api-key-label" style="margin-bottom:6px">Icon</label>
        <div class="flex gap-2" style="flex-wrap:wrap">
          ${['📚','🔬','🧮','💻','📝','🌍','🎨','⚗️','🔭','📐','🎵','🏛️'].map(e =>
            `<button onclick="document.getElementById('subj-icon').value='${e}';document.querySelectorAll('.icon-pick').forEach(b=>b.classList.remove('btn-primary'));this.classList.add('btn-primary')" class="btn btn-secondary btn-sm icon-pick">${e}</button>`
          ).join('')}
        </div>
        <input type="hidden" id="subj-icon" value="📚" />
      </div>
      <div>
        <label class="api-key-label" style="margin-bottom:6px">Color</label>
        <div class="flex gap-2">
          ${['#c9a84c','#9b87f0','#4fd1c5','#10a37f','#e8864a','#e74c3c','#3b82f6','#ec4899'].map(c =>
            `<button onclick="document.getElementById('subj-color').value='${c}';document.querySelectorAll('.color-pick').forEach(b=>b.style.outline='none');this.style.outline='2px solid white'" class="color-pick" style="width:26px;height:26px;border-radius:50%;background:${c};border:none;cursor:pointer;outline:none"></button>`
          ).join('')}
        </div>
        <input type="hidden" id="subj-color" value="#c9a84c" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
      <button class="btn btn-primary" onclick="addSubject()">Add Subject</button>
    </div>
  `);
}

function addSubject() {
  const name  = document.getElementById('subj-name').value.trim();
  const icon  = document.getElementById('subj-icon').value;
  const color = document.getElementById('subj-color').value;
  if (!name) { toast('Please enter a subject name.', 'error'); return; }
  STATE.subjects.push({ id: uid(), name, icon, color, notes: [] });
  save();
  hideModal();
  renderDashboard();
  toast(`"${name}" added!`, 'success');
}

function deleteSubject(id) {
  STATE.subjects = STATE.subjects.filter(s => s.id !== id);
  save();
  renderDashboard();
  toast('Subject removed.', 'info');
}

/* ═══════════════════════════════════════════════════════
   CHAT GPT PAGE
═══════════════════════════════════════════════════════ */
function renderChatGPT() {
  const container = document.getElementById('page-container');
  container.innerHTML = `
    <div class="chat-layout" style="height:100vh">
      <div class="page-header">
        <div class="page-title-group">
          <div class="page-label">
            <span class="label-dot" style="background:var(--col-gpt)"></span>
            Powered by OpenAI
          </div>
          <h1 class="page-title" style="font-size:1.5rem">ChatGPT — General Intelligence</h1>
        </div>
        <div class="page-actions">
          <select class="model-select" id="gpt-model">
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          </select>
          <button class="btn btn-ghost btn-sm" onclick="clearChat('chatgpt')">Clear Chat</button>
        </div>
      </div>

      <div class="chat-messages" id="chat-messages-gpt" data-placeholder="Ask ChatGPT anything…">
        ${renderChatHistory('chatgpt', '#10a37f', 'GPT')}
      </div>

      <div class="chat-input-area" style="--input-focus:var(--col-gpt);--send-color:var(--col-gpt)">
        <div class="chat-input-toolbar">
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('chatgpt','Explain this concept step by step: ')">📖 Explain</button>
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('chatgpt','Summarize the following: ')">📝 Summarize</button>
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('chatgpt','What are the key points of: ')">🔑 Key Points</button>
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('chatgpt','Give me 5 practice questions about: ')">❓ Practice Q&A</button>
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('chatgpt','Compare and contrast: ')">⚖️ Compare</button>
        </div>
        <div class="chat-input-wrapper">
          <textarea id="input-chatgpt" class="chat-input-box" placeholder="Ask anything… (Shift+Enter for new line)" rows="1"
            onkeydown="handleChatKey(event,'chatgpt')" oninput="autoResize(this)"></textarea>
          <button class="chat-send-btn" id="send-chatgpt" onclick="sendChatGPT()"
            style="--send-color:var(--col-gpt)">➤</button>
        </div>
      </div>
    </div>
  `;
  scrollToBottom('chat-messages-gpt');
}

async function sendChatGPT() {
  const input = document.getElementById('input-chatgpt');
  const text  = input.value.trim();
  if (!text || STATE.loading.chatgpt) return;

  const model  = document.getElementById('gpt-model').value;
  const userMsg = { role: 'user', content: text };
  STATE.chats.chatgpt.push(userMsg);
  input.value = '';
  autoResize(input);

  const msgContainer = document.getElementById('chat-messages-gpt');
  appendMessage(msgContainer, 'user', text, '#10a37f', 'You');
  const thinkEl = appendThinking(msgContainer, '#10a37f', 'GPT');

  STATE.loading.chatgpt = true;
  document.getElementById('send-chatgpt').disabled = true;
  save();

  try {
    const system = `You are a knowledgeable study assistant. Help the student understand concepts clearly. 
Use markdown formatting for structure. Be thorough but concise. Today's date: ${new Date().toLocaleDateString()}.`;
    const reply = await apiOpenAI(STATE.chats.chatgpt, model, system);
    thinkEl.remove();

    STATE.chats.chatgpt.push({ role: 'assistant', content: reply });
    save();

    const el = appendMessage(msgContainer, 'assistant', reply, '#10a37f', 'GPT');
    highlightCode(el);
    renderMath(el);
    studyTimeTick();
  } catch(err) {
    thinkEl.remove();
    appendMessage(msgContainer, 'assistant', `⚠️ Error: ${err.message}`, '#e74c3c', 'GPT');
    toast(err.message, 'error');
  }

  STATE.loading.chatgpt = false;
  document.getElementById('send-chatgpt').disabled = false;
  scrollToBottom('chat-messages-gpt');
}

/* ═══════════════════════════════════════════════════════
   PERPLEXITY RESEARCH PAGE
═══════════════════════════════════════════════════════ */
function renderPerplexity() {
  const container = document.getElementById('page-container');
  const hasPDF = STATE.pdfContext;
  container.innerHTML = `
    <div class="chat-layout" style="height:100vh">
      <div class="page-header">
        <div class="page-title-group">
          <div class="page-label">
            <span class="label-dot" style="background:var(--col-perp)"></span>
            Powered by Perplexity AI
          </div>
          <h1 class="page-title" style="font-size:1.5rem">Research & Verified Sources</h1>
        </div>
        <div class="page-actions">
          <select class="model-select" id="perp-model">
            <option value="llama-3.1-sonar-large-128k-online">Sonar Large (Online)</option>
            <option value="llama-3.1-sonar-small-128k-online">Sonar Small (Online)</option>
            <option value="llama-3.1-sonar-huge-128k-online">Sonar Huge (Online)</option>
          </select>
          <button class="btn btn-ghost btn-sm" onclick="clearChat('perplexity')">Clear Chat</button>
        </div>
      </div>

      <div class="chat-messages" id="chat-messages-perp" data-placeholder="Research any topic with verified web sources…">
        ${renderChatHistory('perplexity', '#9b87f0', 'P')}
      </div>

      <div class="chat-input-area" style="--input-focus:var(--col-perp);--send-color:var(--col-perp)">
        <div class="chat-input-toolbar">
          <label class="upload-btn-label">
            📎 Upload PDF
            <input type="file" accept=".pdf" onchange="handlePDFUpload(event)" />
          </label>
          ${hasPDF ? `<div class="pdf-tag">📄 ${escapeHtml(hasPDF.filename)} (${hasPDF.pages}p)
            <button class="pdf-tag-remove" onclick="clearPDF()">✕</button></div>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('perplexity','Find recent research on: ')">🔍 Research</button>
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('perplexity','What are the latest studies about: ')">📰 Latest Studies</button>
          <button class="btn btn-ghost btn-sm" onclick="insertPrompt('perplexity','Explain with sources: ')">📚 With Sources</button>
        </div>
        <div class="chat-input-wrapper">
          <textarea id="input-perplexity" class="chat-input-box" placeholder="Research a topic… (results include verified citations)" rows="1"
            onkeydown="handleChatKey(event,'perplexity')" oninput="autoResize(this)"></textarea>
          <button class="chat-send-btn" id="send-perplexity" onclick="sendPerplexity()"
            style="background:var(--col-perp)">➤</button>
        </div>
      </div>
    </div>
  `;
  scrollToBottom('chat-messages-perp');
}

async function handlePDFUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    toast('Parsing PDF…', 'info', 2000);
    const data = await parsePDF(file);
    STATE.pdfContext = data;
    save();
    renderPerplexity();
    toast(`PDF loaded: ${file.name} (${data.pages} pages)`, 'success');
  } catch(err) {
    toast('Failed to parse PDF: ' + err.message, 'error');
  }
}

function clearPDF() {
  STATE.pdfContext = null;
  save();
  renderPerplexity();
}

async function sendPerplexity() {
  const input = document.getElementById('input-perplexity');
  const text  = input.value.trim();
  if (!text || STATE.loading.perplexity) return;

  const model = document.getElementById('perp-model').value;
  let userContent = text;

  if (STATE.pdfContext) {
    const excerpt = STATE.pdfContext.text.slice(0, 6000);
    userContent = `I have a document: "${STATE.pdfContext.filename}"\n\nContent excerpt:\n${excerpt}\n\n---\n\nMy question: ${text}`;
  }

  const userMsg = { role: 'user', content: userContent };
  STATE.chats.perplexity.push({ role: 'user', content: text }); // Store cleaned version
  input.value = '';
  autoResize(input);

  const msgContainer = document.getElementById('chat-messages-perp');
  appendMessage(msgContainer, 'user', text, '#9b87f0', 'You');
  const thinkEl = appendThinking(msgContainer, '#9b87f0', 'P');

  STATE.loading.perplexity = true;
  document.getElementById('send-perplexity').disabled = true;

  try {
    const msgs = [...STATE.chats.perplexity.slice(0, -1), userMsg];
    const { content, citations } = await apiPerplexity(msgs, model);
    thinkEl.remove();

    STATE.chats.perplexity.push({ role: 'assistant', content });
    save();

    const el = appendMessageWithCitations(msgContainer, content, citations, '#9b87f0', 'P');
    highlightCode(el);
    renderMath(el);
    studyTimeTick();
  } catch(err) {
    thinkEl.remove();
    appendMessage(msgContainer, 'assistant', `⚠️ Error: ${err.message}`, '#e74c3c', 'P');
    toast(err.message, 'error');
  }

  STATE.loading.perplexity = false;
  document.getElementById('send-perplexity').disabled = false;
  scrollToBottom('chat-messages-perp');
}

function appendMessageWithCitations(container, content, citations, aiColor, aiInitial) {
  const el = document.createElement('div');
  el.className = 'msg assistant';
  el.style.setProperty('--ai-color', aiColor);

  let citationsHtml = '';
  if (citations && citations.length > 0) {
    citationsHtml = `
      <div class="citations-list">
        <div class="citations-list-title">Sources</div>
        ${citations.slice(0,8).map((c,i) => `
          <div class="citation-item">
            <span class="citation-num">${i+1}</span>
            <a href="${escapeHtml(c)}" target="_blank" rel="noopener" class="citation-link">${escapeHtml(c.replace(/^https?:\/\/(www\.)?/,'').split('/')[0])}</a>
          </div>
        `).join('')}
      </div>
    `;
  }

  el.innerHTML = `
    <div class="msg-avatar" style="background:rgba(155,135,240,0.15);color:var(--col-perp);border-color:rgba(155,135,240,0.3)">
      ${aiInitial}
    </div>
    <div class="msg-bubble">
      ${renderMarkdown(content)}
      ${citationsHtml}
    </div>
  `;
  container.appendChild(el);
  scrollToBottom(container.id);
  return el;
}

/* ═══════════════════════════════════════════════════════
   CLAUDE WRITING PAGE
═══════════════════════════════════════════════════════ */
const WRITING_MODES = [
  { id: 'essay',     label: '📝 Essay',      prompt: 'Write a well-structured academic essay on the following topic. Include introduction, body paragraphs with evidence, and conclusion:' },
  { id: 'summary',   label: '📋 Summary',    prompt: 'Provide a concise, comprehensive summary of the following content. Highlight key points and main takeaways:' },
  { id: 'outline',   label: '🗂 Outline',    prompt: 'Create a detailed outline with headings and subheadings for the following topic or content:' },
  { id: 'analysis',  label: '🔍 Analysis',   prompt: 'Provide a thorough analysis of the following. Examine key themes, arguments, implications, and significance:' },
  { id: 'rewrite',   label: '✏️ Rewrite',    prompt: 'Rewrite the following text to be clearer, more engaging, and better structured while preserving the original meaning:' },
  { id: 'proofread', label: '🔎 Proofread',  prompt: 'Proofread and correct the following text. Fix grammar, spelling, punctuation, and style issues. Explain significant changes:' },
  { id: 'expand',    label: '📏 Expand',     prompt: 'Expand the following text with more detail, examples, and explanation while maintaining the same style and tone:' },
  { id: 'cite',      label: '📚 Citations',  prompt: 'Add appropriate in-text citations and suggest a bibliography in APA format for the following academic text:' },
];

function renderClaude() {
  const container = document.getElementById('page-container');
  const mode = STATE.writing.mode || 'essay';
  container.innerHTML = `
    <div style="height:100vh;display:flex;flex-direction:column;overflow:hidden">
      <div class="page-header">
        <div class="page-title-group">
          <div class="page-label">
            <span class="label-dot" style="background:var(--col-claude)"></span>
            Powered by Anthropic Claude
          </div>
          <h1 class="page-title" style="font-size:1.5rem">Writing Assistant</h1>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" onclick="copyOutput()">📋 Copy Output</button>
          <button class="btn btn-secondary btn-sm" onclick="downloadOutput()">💾 Download</button>
          <button class="btn btn-ghost btn-sm" onclick="clearWriting()">Clear</button>
        </div>
      </div>

      <!-- Mode chips -->
      <div style="padding:10px 32px;border-bottom:1px solid var(--border-dim);background:var(--bg-1);display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0">
        ${WRITING_MODES.map(m => `
          <button class="mode-chip ${m.id === mode ? 'active' : ''}" onclick="setWritingMode('${m.id}')" data-mode="${m.id}">${m.label}</button>
        `).join('')}
      </div>

      <div class="writing-layout" style="flex:1">
        <div class="writing-panel">
          <div class="writing-panel-header">
            <span class="writing-panel-title">Input</span>
            <div class="flex gap-2">
              <span class="text-muted text-sm" id="word-count">0 words</span>
            </div>
          </div>
          <textarea id="writing-input" class="writing-textarea" placeholder="Paste your text, notes, or topic here…"
            oninput="updateWordCount()">${escapeHtml(STATE.writing.input || '')}</textarea>
          <div class="writing-toolbar">
            <button class="btn btn-primary" id="writing-submit" onclick="submitWriting()">
              ✦ Generate with Claude
            </button>
            <span class="text-muted text-sm">Claude Sonnet 4.6</span>
          </div>
        </div>

        <div class="writing-panel">
          <div class="writing-panel-header">
            <span class="writing-panel-title">Claude's Output</span>
            <div id="writing-status" class="text-muted text-sm"></div>
          </div>
          <div id="writing-output" class="writing-output">
            ${STATE.writing.output
              ? renderMarkdown(STATE.writing.output)
              : `<div class="empty-state"><span class="empty-icon">✍️</span><p class="empty-title">Output appears here</p><p class="empty-desc">Type or paste your content on the left, choose a mode, then click Generate.</p></div>`
            }
          </div>
        </div>
      </div>
    </div>
  `;
  updateWordCount();

  if (STATE.writing.output) {
    const out = document.getElementById('writing-output');
    highlightCode(out);
    renderMath(out);
  }
}

function setWritingMode(mode) {
  STATE.writing.mode = mode;
  save();
  document.querySelectorAll('.mode-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.mode === mode);
  });
}

function updateWordCount() {
  const ta = document.getElementById('writing-input');
  if (!ta) return;
  const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
  const el = document.getElementById('word-count');
  if (el) el.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  STATE.writing.input = ta.value;
}

async function submitWriting() {
  const input   = document.getElementById('writing-input').value.trim();
  if (!input) { toast('Please enter some text or a topic.', 'error'); return; }
  if (STATE.loading.claude) return;

  const mode    = WRITING_MODES.find(m => m.id === STATE.writing.mode) || WRITING_MODES[0];
  const btn     = document.getElementById('writing-submit');
  const status  = document.getElementById('writing-status');
  const output  = document.getElementById('writing-output');

  btn.disabled = true;
  STATE.loading.claude = true;
  status.textContent = 'Claude is writing…';
  output.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div><p class="text-muted">Generating…</p></div>`;

  try {
    const system = `You are an expert writing assistant. Produce high-quality, well-structured academic and professional writing.
Use markdown formatting: headers, bullet points, bold for emphasis where appropriate.
Be thorough, clear, and precise.`;
    const prompt = `${mode.prompt}\n\n---\n\n${input}`;
    const reply  = await apiAnthropic([{ role: 'user', content: prompt }], system);

    STATE.writing.output = reply;
    save();

    output.innerHTML = renderMarkdown(reply);
    highlightCode(output);
    renderMath(output);
    status.textContent = `Done · ${reply.split(/\s+/).length} words`;
    studyTimeTick();
    toast('Writing complete!', 'success');
  } catch(err) {
    output.innerHTML = `<div class="empty-state"><span style="color:var(--col-wolfram)">⚠️ ${escapeHtml(err.message)}</span></div>`;
    status.textContent = 'Error';
    toast(err.message, 'error');
  }

  STATE.loading.claude = false;
  btn.disabled = false;
}

function copyOutput() {
  if (!STATE.writing.output) { toast('Nothing to copy.', 'error'); return; }
  navigator.clipboard.writeText(STATE.writing.output).then(() => toast('Copied to clipboard!', 'success'));
}

function downloadOutput() {
  if (!STATE.writing.output) { toast('Nothing to download.', 'error'); return; }
  const mode = STATE.writing.mode || 'output';
  const blob = new Blob([STATE.writing.output], { type: 'text/markdown' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `studyai-${mode}-${Date.now()}.md`;
  a.click();
  toast('Downloaded!', 'success');
}

function clearWriting() {
  STATE.writing.input  = '';
  STATE.writing.output = '';
  save();
  renderClaude();
}

/* ═══════════════════════════════════════════════════════
   FLASHCARDS PAGE
═══════════════════════════════════════════════════════ */
function renderFlashcards() {
  const container = document.getElementById('page-container');
  const activeDeck = STATE.decks.find(d => d.id === STATE.activeDeck) || STATE.decks[0];

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <div class="page-label">
          <span class="label-dot" style="background:var(--col-turbo)"></span>
          Powered by GPT-3.5 Turbo
        </div>
        <h1 class="page-title" style="font-size:1.5rem">Flashcards & Memorization</h1>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openNewDeck()">+ New Deck</button>
        ${activeDeck && activeDeck.cards.length > 0 ? `<button class="btn btn-secondary" onclick="startStudy('${activeDeck.id}')">▶ Study Now</button>` : ''}
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" onclick="showFlashTab('generate',this)" style="--tab-color:var(--col-turbo)">Generate</button>
      <button class="tab" onclick="showFlashTab('decks',this)" style="--tab-color:var(--col-turbo)">My Decks</button>
      ${activeDeck ? `<button class="tab" onclick="showFlashTab('study',this)" style="--tab-color:var(--col-turbo)">Study Mode</button>` : ''}
    </div>

    <div id="flash-tab-content">
      ${renderFlashGenerate()}
    </div>
  `;
}

function showFlashTab(tab, btn) {
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const content = document.getElementById('flash-tab-content');
  if (tab === 'generate') content.innerHTML = renderFlashGenerate();
  else if (tab === 'decks') content.innerHTML = renderFlashDecks();
  else if (tab === 'study') {
    const activeDeck = STATE.decks.find(d => d.id === STATE.activeDeck) || STATE.decks[0];
    if (activeDeck) startStudy(activeDeck.id);
  }
}

function renderFlashGenerate() {
  return `
    <div class="flashcards-layout">
      <div class="card flashcard-gen-area mt-4">
        <div class="dash-section-title" style="font-size:1rem;margin-bottom:12px">Generate Flashcards from Content</div>
        <textarea id="fc-input" placeholder="Paste your notes, lecture content, or topic here…&#10;&#10;Example: The mitochondria is the powerhouse of the cell. ATP synthesis occurs in the inner membrane…"
          style="width:100%;min-height:150px;background:var(--bg-input);border:1px solid var(--border-med);border-radius:var(--radius-md);color:var(--text-1);font-family:var(--font-body);font-size:0.88rem;padding:14px 16px;resize:vertical;margin-bottom:12px"></textarea>
        <div class="flex gap-2 items-center flex-wrap">
          <div class="flex gap-2 items-center">
            <label class="text-sm text-muted">Cards:</label>
            <select id="fc-count" class="model-select">
              <option value="5">5</option>
              <option value="10" selected>10</option>
              <option value="15">15</option>
              <option value="20">20</option>
            </select>
          </div>
          <div class="flex gap-2 items-center">
            <label class="text-sm text-muted">Deck:</label>
            <select id="fc-deck" class="model-select">
              <option value="new">+ New Deck</option>
              ${STATE.decks.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}
            </select>
          </div>
          <div class="flex gap-2 items-center" id="new-deck-input" style="display:${STATE.decks.length ? 'none' : 'flex'}!important">
            <input type="text" id="fc-deck-name" placeholder="Deck name…" style="width:160px" />
          </div>
          <button class="btn btn-primary" id="fc-gen-btn" onclick="generateFlashcards()">
            ⚡ Generate
          </button>
        </div>
      </div>
      <div id="fc-preview"></div>
    </div>
  `;
}

function renderFlashDecks() {
  if (!STATE.decks.length) {
    return `<div class="flashcards-layout"><div class="empty-state" style="padding-top:60px">
      <span class="empty-icon">🃏</span>
      <p class="empty-title">No decks yet</p>
      <p class="empty-desc">Generate flashcards from your notes using the Generate tab.</p>
    </div></div>`;
  }

  return `
    <div class="flashcards-layout">
      <div class="mt-4">
        ${STATE.decks.map(deck => `
          <div class="card" style="padding:20px;margin-bottom:12px">
            <div class="flex items-center justify-between mb-4">
              <div>
                <div style="font-weight:700;font-size:1rem;color:var(--text-1)">${escapeHtml(deck.name)}</div>
                <div class="text-muted text-sm">${deck.cards.length} cards · 
                  ${deck.cards.filter(c=>c.status==='known').length} known · 
                  ${deck.cards.filter(c=>c.status==='review').length} reviewing
                </div>
              </div>
              <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" onclick="startStudy('${deck.id}')">▶ Study</button>
                <button class="btn btn-danger btn-sm" onclick="deleteDeck('${deck.id}')">Delete</button>
              </div>
            </div>
            <div class="cards-list-grid">
              ${deck.cards.slice(0,6).map((c,i) => `
                <div class="card-list-item">
                  <button class="cli-delete" onclick="deleteCard('${deck.id}','${c.id}')">✕</button>
                  <div class="cli-q">${escapeHtml(c.q)}</div>
                  <div class="cli-a">${escapeHtml(c.a)}</div>
                  <span class="card-status status-${c.status || 'new'}">${c.status || 'new'}</span>
                </div>
              `).join('')}
              ${deck.cards.length > 6 ? `<div class="card-list-item" style="display:flex;align-items:center;justify-content:center;color:var(--text-4);font-size:0.85rem">+${deck.cards.length - 6} more</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function generateFlashcards() {
  const input   = document.getElementById('fc-input').value.trim();
  if (!input) { toast('Please enter some content.', 'error'); return; }
  if (STATE.loading.flashcards) return;

  const count   = parseInt(document.getElementById('fc-count').value);
  const deckSel = document.getElementById('fc-deck').value;
  let deckName  = '';

  if (deckSel === 'new') {
    deckName = document.getElementById('fc-deck-name')?.value?.trim() || 'New Deck';
  }

  const btn = document.getElementById('fc-gen-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  STATE.loading.flashcards = true;

  const preview = document.getElementById('fc-preview');
  preview.innerHTML = `<div class="empty-state" style="padding:40px"><div class="loading-spinner"></div><p class="text-muted">GPT-3.5 Turbo is creating ${count} flashcards…</p></div>`;

  try {
    const prompt = `Create exactly ${count} flashcards from the following study material.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "cards": [
    {"q": "Question 1?", "a": "Answer 1"},
    {"q": "Question 2?", "a": "Answer 2"}
  ]
}

Make questions clear and specific. Answers should be concise (1-3 sentences).
Cover the most important concepts.

Study material:
${input.slice(0, 4000)}`;

    const raw = await apiOpenAI([{ role: 'user', content: prompt }], 'gpt-3.5-turbo');

    // Parse JSON (strip markdown fences if present)
    const clean = raw.replace(/```json|```/g, '').trim();
    const data  = JSON.parse(clean);

    if (!data.cards || !Array.isArray(data.cards)) throw new Error('Invalid response format');

    const cards = data.cards.map(c => ({ id: uid(), q: c.q, a: c.a, status: 'new' }));

    // Add to deck
    let deck;
    if (deckSel === 'new') {
      deck = { id: uid(), name: deckName || 'New Deck', cards };
      STATE.decks.push(deck);
    } else {
      deck = STATE.decks.find(d => d.id === deckSel);
      if (deck) deck.cards.push(...cards);
    }
    STATE.activeDeck = deck?.id;
    save();

    preview.innerHTML = `
      <div class="card" style="padding:20px;margin-top:16px">
        <div class="dash-section-title" style="font-size:1rem;margin-bottom:12px">
          ✅ Generated ${cards.length} flashcards for "${escapeHtml(deckName || (deck?.name) || 'deck')}"
          <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="startStudy('${deck?.id}')">▶ Study Now</button>
        </div>
        <div class="cards-list-grid">
          ${cards.map(c => `
            <div class="card-list-item">
              <div class="cli-q">${escapeHtml(c.q)}</div>
              <div class="cli-a">${escapeHtml(c.a)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    toast(`${cards.length} flashcards created!`, 'success');
    studyTimeTick();
  } catch(err) {
    preview.innerHTML = `<div class="empty-state" style="padding:40px"><p style="color:var(--col-wolfram)">⚠️ ${escapeHtml(err.message)}</p></div>`;
    toast(err.message, 'error');
  }

  STATE.loading.flashcards = false;
  btn.disabled = false;
  btn.textContent = '⚡ Generate';
}

function openNewDeck() {
  showModal(`
    <div class="modal-title">Create New Deck</div>
    <div class="flex flex-col gap-3">
      <input type="text" id="new-deck-name" placeholder="Deck name (e.g. Biology Chapter 3)" class="w-full" style="width:100%" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createEmptyDeck()">Create</button>
    </div>
  `);
}

function createEmptyDeck() {
  const name = document.getElementById('new-deck-name').value.trim();
  if (!name) { toast('Enter a deck name.', 'error'); return; }
  const deck = { id: uid(), name, cards: [] };
  STATE.decks.push(deck);
  STATE.activeDeck = deck.id;
  save();
  hideModal();
  renderFlashcards();
  toast(`Deck "${name}" created!`, 'success');
}

function deleteDeck(id) {
  STATE.decks = STATE.decks.filter(d => d.id !== id);
  if (STATE.activeDeck === id) STATE.activeDeck = STATE.decks[0]?.id || null;
  save();
  renderFlashcards();
  toast('Deck deleted.', 'info');
}

function deleteCard(deckId, cardId) {
  const deck = STATE.decks.find(d => d.id === deckId);
  if (!deck) return;
  deck.cards = deck.cards.filter(c => c.id !== cardId);
  save();
  // Re-render the decks tab
  document.getElementById('flash-tab-content').innerHTML = renderFlashDecks();
}

function startStudy(deckId) {
  const deck = STATE.decks.find(d => d.id === deckId);
  if (!deck || !deck.cards.length) { toast('No cards in this deck!', 'error'); return; }
  STATE.activeDeck = deckId;
  STATE.studyCardIdx = 0;
  save();
  renderStudyMode(deck);
}

function renderStudyMode(deck) {
  const container = document.getElementById('flash-tab-content');
  if (!deck || !deck.cards.length) return;
  const idx   = STATE.studyCardIdx;
  const card  = deck.cards[idx];
  const total = deck.cards.length;
  const pct   = Math.round((idx / total) * 100);
  const known = deck.cards.filter(c => c.status === 'known').length;

  container.innerHTML = `
    <div class="flashcard-study">
      <div class="flashcard-progress">
        <span class="progress-label">${idx + 1} / ${total}</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-label">${known} known</span>
      </div>

      <div class="flashcard-container" onclick="flipCard(this)">
        <div class="flashcard-inner" id="fc-inner-${card.id}">
          <div class="flashcard-face front">
            <span class="card-label">Question</span>
            <div class="card-text">${escapeHtml(card.q)}</div>
            <span class="card-hint">Click to reveal answer</span>
          </div>
          <div class="flashcard-face back">
            <span class="card-label" style="color:var(--col-turbo)">Answer</span>
            <div class="card-text" style="font-size:1.15rem">${escapeHtml(card.a)}</div>
          </div>
        </div>
      </div>

      <div class="flashcard-actions">
        <button class="btn btn-danger" onclick="markCard('${deck.id}','${card.id}','review')">🔄 Study More</button>
        <button class="btn btn-secondary" onclick="skipCard('${deck.id}')">⏭ Skip</button>
        <button class="btn btn-primary" style="background:#4ade80;border-color:#4ade80" onclick="markCard('${deck.id}','${card.id}','known')">✅ Know It!</button>
      </div>

      <div class="flex gap-2 mt-4">
        <button class="btn btn-ghost btn-sm" onclick="navigate('flashcards')">← Back to Decks</button>
        <button class="btn btn-ghost btn-sm" onclick="shuffleAndRestart('${deck.id}')">🔀 Shuffle & Restart</button>
      </div>
    </div>
  `;
}

function flipCard(container) {
  const inner = container.querySelector('.flashcard-inner');
  inner.classList.toggle('flipped');
}

function markCard(deckId, cardId, status) {
  const deck = STATE.decks.find(d => d.id === deckId);
  if (!deck) return;
  const card = deck.cards.find(c => c.id === cardId);
  if (card) card.status = status;

  STATE.studyCardIdx++;
  save();

  if (STATE.studyCardIdx >= deck.cards.length) {
    // Session complete
    const known = deck.cards.filter(c => c.status === 'known').length;
    const total = deck.cards.length;
    document.getElementById('flash-tab-content').innerHTML = `
      <div class="flashcard-study">
        <div class="empty-state">
          <span class="empty-icon">🎉</span>
          <p class="empty-title">Session Complete!</p>
          <p class="empty-desc">You reviewed all ${total} cards.<br>${known} known · ${total - known} to review.</p>
          <div class="flex gap-3 mt-4">
            <button class="btn btn-primary" onclick="startStudy('${deckId}')">Study Again</button>
            <button class="btn btn-secondary" onclick="navigate('flashcards')">← Back</button>
          </div>
        </div>
      </div>
    `;
    toast(`Session done! ${known}/${total} cards known.`, 'success');
    studyTimeTick();
    return;
  }

  renderStudyMode(deck);
}

function skipCard(deckId) {
  const deck = STATE.decks.find(d => d.id === deckId);
  if (!deck) return;
  STATE.studyCardIdx = (STATE.studyCardIdx + 1) % deck.cards.length;
  save();
  renderStudyMode(deck);
}

function shuffleAndRestart(deckId) {
  const deck = STATE.decks.find(d => d.id === deckId);
  if (!deck) return;
  for (let i = deck.cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck.cards[i], deck.cards[j]] = [deck.cards[j], deck.cards[i]];
  }
  STATE.studyCardIdx = 0;
  save();
  renderStudyMode(deck);
}

/* ═══════════════════════════════════════════════════════
   WOLFRAM MATH PAGE
═══════════════════════════════════════════════════════ */
const MATH_SHORTCUTS = [
  'Solve x^2 - 5x + 6 = 0',
  'Derivative of sin(x)cos(x)',
  'Integral of x^2 from 0 to 3',
  'Limit of sin(x)/x as x→0',
  'Factor x^3 - 8',
  'Eigenvalues of [[2,1],[1,3]]',
  'Surface area of sphere radius 5',
  'Normal distribution mean=0 std=1',
  'Binomial theorem (a+b)^4',
  'Taylor series of e^x',
];

function renderWolfram() {
  const container = document.getElementById('page-container');
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <div class="page-label">
          <span class="label-dot" style="background:var(--col-wolfram)"></span>
          Powered by Wolfram Alpha
        </div>
        <h1 class="page-title" style="font-size:1.5rem">Math & Problem Solving</h1>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" onclick="STATE.wolframHistory=[];save();renderWolfram()">Clear History</button>
      </div>
    </div>

    <div class="wolfram-layout">
      <div class="wolfram-search-box">
        <input type="text" id="wolfram-input" class="wolfram-input"
          placeholder="Enter any math problem, equation, or scientific question…"
          onkeydown="if(event.key==='Enter')solveWolfram()"
          value="" />
        <button class="btn btn-primary" style="background:var(--col-wolfram);border-color:var(--col-wolfram);padding:0 24px;height:52px;font-size:1rem" onclick="solveWolfram()">Solve</button>
      </div>

      <div class="math-shortcuts">
        ${MATH_SHORTCUTS.map(s => `
          <button class="math-shortcut" onclick="useShortcut('${escapeHtml(s)}')">${escapeHtml(s)}</button>
        `).join('')}
      </div>

      ${STATE.wolframHistory.length > 0 ? `
        <div style="margin-bottom:16px">
          <div class="dash-section-title" style="font-size:0.85rem;margin-bottom:8px">Recent Queries</div>
          <div class="wolfram-history">
            ${STATE.wolframHistory.slice(-10).reverse().map(q => `
              <div class="history-chip" onclick="useShortcut('${escapeHtml(q)}')">${escapeHtml(q)}</div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div id="wolfram-results">
        ${!STATE.wolframHistory.length ? `
          <div class="empty-state" style="padding:60px 0">
            <span class="empty-icon" style="font-family:var(--font-mono)">∑</span>
            <p class="empty-title">Wolfram Alpha Math Solver</p>
            <p class="empty-desc">Enter any mathematical expression, equation, integral, derivative, matrix operation, statistical problem, or scientific question above.</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function useShortcut(q) {
  const input = document.getElementById('wolfram-input');
  if (input) {
    input.value = q;
    input.focus();
  }
}

async function solveWolfram() {
  const input = document.getElementById('wolfram-input');
  const query = input?.value?.trim();
  if (!query) { toast('Enter a math problem.', 'error'); return; }
  if (STATE.loading.wolfram) return;

  const results = document.getElementById('wolfram-results');
  results.innerHTML = `<div class="empty-state" style="padding:40px"><div class="loading-spinner" style="border-top-color:var(--col-wolfram)"></div><p class="text-muted">Computing with Wolfram Alpha…</p></div>`;

  STATE.loading.wolfram = true;

  // Add to history
  if (!STATE.wolframHistory.includes(query)) {
    STATE.wolframHistory.push(query);
    if (STATE.wolframHistory.length > 20) STATE.wolframHistory.shift();
  }
  save();

  try {
    const data = await apiWolfram(query);

    if (!data.success || !data.pods || data.pods.length === 0) {
      results.innerHTML = `
        <div class="wolfram-pod">
          <div class="wolfram-pod-header"><span class="pod-title">No Result</span></div>
          <div class="wolfram-pod-body">
            <p class="text-muted">Wolfram Alpha couldn't interpret this query. Try rephrasing it.</p>
            <p class="text-muted text-sm mt-4">Tips: Use standard math notation (e.g., x^2, sqrt(x), sin(x)). For equations, use =.</p>
          </div>
        </div>
      `;
      return;
    }

    // Primary result pods to highlight
    const primaryTitles = ['Result', 'Results', 'Solution', 'Solutions', 'Derivative', 'Integral',
      'Value', 'Answer', 'Decimal approximation'];

    results.innerHTML = data.pods.map((pod, idx) => {
      const isPrimary = primaryTitles.some(t => pod.title.toLowerCase().includes(t.toLowerCase()));
      return `
        <div class="wolfram-pod ${isPrimary ? 'pod-primary' : ''}">
          <div class="wolfram-pod-header">
            <span class="pod-title">${escapeHtml(pod.title)}</span>
          </div>
          <div class="wolfram-pod-body">
            ${pod.subpods.map(sp => `
              ${sp.plaintext ? `<div class="pod-plaintext">${escapeHtml(sp.plaintext)}</div>` : ''}
              ${sp.img ? `<img src="${escapeHtml(sp.img.src)}" alt="${escapeHtml(sp.img.alt || pod.title)}" loading="lazy" />` : ''}
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Render math in the results
    renderMath(results);
    studyTimeTick();
    toast('Solution computed!', 'success');
  } catch(err) {
    results.innerHTML = `
      <div class="wolfram-pod">
        <div class="wolfram-pod-header"><span class="pod-title" style="color:var(--col-wolfram)">Error</span></div>
        <div class="wolfram-pod-body">
          <p class="text-muted">⚠️ ${escapeHtml(err.message)}</p>
        </div>
      </div>
    `;
    toast(err.message, 'error');
  }

  STATE.loading.wolfram = false;
}

/* ═══════════════════════════════════════════════════════
   SETTINGS PAGE
═══════════════════════════════════════════════════════ */
function renderSettings() {
  const container = document.getElementById('page-container');
  const k = STATE.keys;

  const mask = v => v ? v.slice(0,7) + '…' + v.slice(-4) : '';

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title-group">
        <div class="page-label"><span class="label-dot" style="background:var(--text-3)"></span>Configuration</div>
        <h1 class="page-title">Settings & API Keys</h1>
      </div>
    </div>

    <div class="settings-layout">

      <!-- API Keys -->
      <div class="settings-section">
        <div class="settings-section-title">API Keys</div>
        <p class="text-muted text-sm mb-4" style="margin-bottom:20px">Your keys are stored locally in your browser and never sent to any server except the respective AI provider.</p>

        ${[
          {
            id: 'openai', label: 'OpenAI (ChatGPT + Flashcards)', color: 'var(--col-gpt)',
            hint: 'platform.openai.com/api-keys',
            desc: 'Powers ChatGPT general assistant and GPT-3.5 Turbo flashcard generation.',
            ph: 'sk-…'
          },
          {
            id: 'perplexity', label: 'Perplexity AI (Research)', color: 'var(--col-perp)',
            hint: 'perplexity.ai/settings/api',
            desc: 'Powers the research assistant with real-time web search and verified citations.',
            ph: 'pplx-…'
          },
          {
            id: 'anthropic', label: 'Anthropic (Claude Writing)', color: 'var(--col-claude)',
            hint: 'console.anthropic.com/settings/keys',
            desc: 'Powers the writing assistant using Claude Sonnet 4.6.',
            ph: 'sk-ant-…'
          },
          {
            id: 'wolfram', label: 'Wolfram Alpha App ID (Math)', color: 'var(--col-wolfram)',
            hint: 'developer.wolframalpha.com (free tier available)',
            desc: 'Powers the math & science solver. Sign up free at developer.wolframalpha.com.',
            ph: 'XXXXXX-XXXXXXXXXX'
          },
        ].map(api => `
          <div class="api-key-row">
            <div class="api-key-label">
              <span class="ai-color-dot" style="background:${api.color}"></span>
              ${api.label}
              <span class="key-hint">${api.hint}</span>
            </div>
            <p class="api-key-desc">${api.desc}</p>
            <div class="api-key-input-wrap">
              <input type="password" id="key-${api.id}" class="api-key-input"
                placeholder="${api.ph}"
                value="${k[api.id] ? mask(k[api.id]) : ''}"
                onfocus="if(this.value.includes('…'))this.value=''"
              />
              <button class="btn btn-secondary btn-sm" onclick="saveKey('${api.id}')">Save</button>
              ${k[api.id] ? `<button class="btn btn-danger btn-sm" onclick="clearKey('${api.id}')">Clear</button>` : ''}
            </div>
            ${k[api.id] ? `<div style="display:flex;align-items:center;gap:6px;margin-top:4px">
              <span class="status-dot active" style="width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px rgba(74,222,128,0.6);display:inline-block"></span>
              <span class="text-sm text-muted">Key saved</span>
            </div>` : ''}
          </div>
        `).join('')}
      </div>

      <!-- Data -->
      <div class="settings-section">
        <div class="settings-section-title">Data & Storage</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Subjects</div>
            <div class="settings-row-desc">${STATE.subjects.length} subjects stored</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Flashcard Decks</div>
            <div class="settings-row-desc">${STATE.decks.length} decks, ${STATE.decks.reduce((s,d)=>s+d.cards.length,0)} total cards</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Chat History</div>
            <div class="settings-row-desc">
              ChatGPT: ${STATE.chats.chatgpt.length} messages ·
              Perplexity: ${STATE.chats.perplexity.length} messages ·
              Claude: ${STATE.chats.claude.length} messages
            </div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="clearAllChats()">Clear All</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Reset Everything</div>
            <div class="settings-row-desc">Clear all data including subjects, decks, and chat history</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="resetAll()">Reset</button>
        </div>
      </div>

      <!-- About -->
      <div class="settings-section">
        <div class="settings-section-title">About</div>
        <div class="card" style="padding:20px">
          <p class="text-muted text-sm" style="line-height:1.8">
            <strong style="color:var(--text-1)">StudyAI v1.0.0</strong><br>
            An intelligent study platform integrating multiple AI services.<br><br>
            <strong style="color:var(--text-1)">ChatGPT (OpenAI)</strong> — General study assistance, explanations, Q&A<br>
            <strong style="color:var(--text-1)">Perplexity AI</strong> — Research with live web search and verified citations<br>
            <strong style="color:var(--text-1)">Claude (Anthropic)</strong> — Essay writing, summarization, proofreading<br>
            <strong style="color:var(--text-1)">GPT-3.5 Turbo</strong> — Automatic flashcard generation from your notes<br>
            <strong style="color:var(--text-1)">Wolfram Alpha</strong> — Mathematical computation and step-by-step solutions<br><br>
            All API keys are stored locally in your browser. No data is collected.
          </p>
        </div>
      </div>
    </div>
  `;
}

function saveKey(id) {
  const input = document.getElementById(`key-${id}`);
  const val   = input.value.trim();
  if (!val || val.includes('…')) { toast('Please enter a valid API key.', 'error'); return; }
  STATE.keys[id] = val;
  save();
  updateStatusDots();
  renderSettings();
  toast('API key saved!', 'success');
}

function clearKey(id) {
  STATE.keys[id] = '';
  save();
  updateStatusDots();
  renderSettings();
  toast('API key cleared.', 'info');
}

function clearAllChats() {
  STATE.chats = { chatgpt: [], perplexity: [], claude: [] };
  save();
  toast('All chat history cleared.', 'info');
  renderSettings();
}

function resetAll() {
  if (!confirm('This will clear ALL data including subjects, decks, and chat history. Are you sure?')) return;
  STATE.subjects       = [];
  STATE.chats          = { chatgpt: [], perplexity: [], claude: [] };
  STATE.decks          = [];
  STATE.wolframHistory = [];
  STATE.writing        = { mode: 'essay', input: '', output: '' };
  STATE.sessions       = { total: 0, today: 0, streak: 0 };
  save();
  toast('All data cleared.', 'info');
  renderSettings();
}

/* ═══════════════════════════════════════════════════════
   SHARED CHAT HELPERS
═══════════════════════════════════════════════════════ */
function renderChatHistory(chatKey, aiColor, aiInitial) {
  const history = STATE.chats[chatKey] || [];
  if (!history.length) return '';
  return history.map(msg => {
    if (msg.role === 'user') {
      return buildMsgHTML('user', msg.content, aiColor, 'You');
    } else {
      return buildMsgHTML('assistant', msg.content, aiColor, aiInitial);
    }
  }).join('');
}

function buildMsgHTML(role, content, aiColor, aiInitial) {
  if (role === 'user') {
    return `<div class="msg user">
      <div class="msg-avatar">You</div>
      <div class="msg-bubble">${escapeHtml(content)}</div>
    </div>`;
  }
  return `<div class="msg assistant">
    <div class="msg-avatar" style="background:rgba(255,255,255,0.05);color:${aiColor};border-color:${aiColor}33">${aiInitial}</div>
    <div class="msg-bubble">${renderMarkdown(content)}</div>
  </div>`;
}

function appendMessage(container, role, content, aiColor, aiInitial) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  if (role === 'user') {
    el.innerHTML = `
      <div class="msg-avatar">You</div>
      <div class="msg-bubble">${escapeHtml(content)}</div>
    `;
  } else {
    el.innerHTML = `
      <div class="msg-avatar" style="background:rgba(255,255,255,0.05);color:${aiColor};border-color:${aiColor}33">${aiInitial}</div>
      <div class="msg-bubble">${renderMarkdown(content)}</div>
    `;
  }
  container.appendChild(el);
  scrollToBottom(container.id);
  return el;
}

function appendThinking(container, aiColor, aiInitial) {
  const el = document.createElement('div');
  el.className = 'msg assistant msg-thinking';
  el.innerHTML = `
    <div class="msg-avatar" style="background:rgba(255,255,255,0.05);color:${aiColor};border-color:${aiColor}33">${aiInitial}</div>
    <div class="msg-bubble">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      Thinking…
    </div>
  `;
  container.appendChild(el);
  scrollToBottom(container.id);
  return el;
}

function scrollToBottom(id) {
  const el = document.getElementById(id);
  if (el) el.scrollTop = el.scrollHeight;
}

function clearChat(chatKey) {
  STATE.chats[chatKey] = [];
  save();
  navigate(STATE.page);
}

function insertPrompt(chatKey, prefix) {
  const inputId = `input-${chatKey}`;
  const input   = document.getElementById(inputId);
  if (!input) return;
  input.value = prefix;
  input.focus();
  autoResize(input);
}

function handleChatKey(event, chatKey) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    if (chatKey === 'chatgpt')    sendChatGPT();
    else if (chatKey === 'perplexity') sendPerplexity();
  }
}

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  load();

  // Nav links
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      navigate(el.dataset.page);
      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Mobile sidebar toggle
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Modal overlay close
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) hideModal();
  });

  // Initialize marked
  if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
  }

  // Study time ticker (increment every 60 seconds while page is open)
  setInterval(studyTimeTick, 60000);

  // Initial render
  navigate('dashboard');
  updateStatusDots();

  // Check if any keys are missing and show a hint
  const missingKeys = Object.values(STATE.keys).filter(k => !k).length;
  if (missingKeys === 4) {
    setTimeout(() => toast('Welcome to StudyAI! Add your API keys in Settings to get started.', 'info', 5000), 800);
  }
});

// Expose functions to global scope for inline handlers
Object.assign(window, {
  navigate, hideModal, showModal,
  openAddSubject, addSubject, deleteSubject,
  sendChatGPT, sendPerplexity, submitWriting,
  setWritingMode, updateWordCount, copyOutput, downloadOutput, clearWriting,
  generateFlashcards, openNewDeck, createEmptyDeck, deleteDeck, deleteCard,
  startStudy, flipCard, markCard, skipCard, shuffleAndRestart,
  showFlashTab, handlePDFUpload, clearPDF, insertPrompt, handleChatKey,
  solveWolfram, useShortcut, clearChat,
  saveKey, clearKey, clearAllChats, resetAll, autoResize,
  STATE,
});
