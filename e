# 🎓 StudyAI — Multi-AI Study Platform

A full-stack study platform integrating **5 AI services** into one beautiful interface.

## AI Services

| Tool | Provider | Purpose |
|------|----------|---------|
| **ChatGPT** | OpenAI (GPT-4o) | General study assistance, explanations, Q&A |
| **Research** | Perplexity AI | Research with live web citations |
| **Writing** | Anthropic Claude | Essay writing, summaries, proofreading |
| **Flashcards** | OpenAI GPT-3.5 Turbo | Auto-generate flashcards from your notes |
| **Math** | Wolfram Alpha | Step-by-step math & science solutions |

---

## Quick Start

### 1. Install dependencies
```bash
cd study-ai
npm install
```

### 2. Start the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 3. Open in browser
```
http://localhost:3000
```

### 4. Add your API keys
Go to **Settings → API Keys** and add:

| Key | Where to get it |
|-----|----------------|
| **OpenAI** | https://platform.openai.com/api-keys |
| **Perplexity** | https://www.perplexity.ai/settings/api |
| **Anthropic** | https://console.anthropic.com/settings/keys |
| **Wolfram Alpha** | https://developer.wolframalpha.com (free tier: 2000 calls/month) |

---

## Features

### 📊 Dashboard
- Organize your studies into subjects/courses
- Quick access to all AI tools
- Study statistics and progress tracking

### 🧠 ChatGPT — General Intelligence
- Full conversation history
- Choose between GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo
- Quick prompt templates (Explain, Summarize, Practice Q&A, etc.)
- Markdown rendering with code highlighting

### 🔍 Perplexity — Research
- Real-time web search with verified citations
- **PDF upload** — upload course materials, papers, lecture notes
- Sources listed below every response
- Models: Sonar Small, Large, Huge

### ✍️ Claude — Writing Assistant
- **8 writing modes**: Essay, Summary, Outline, Analysis, Rewrite, Proofread, Expand, Citations
- Side-by-side input/output editor
- Export as Markdown file
- Word count tracking

### 🃏 Flashcards — GPT-3.5 Turbo
- Paste any notes → auto-generate 5–20 flashcards
- Organize into named decks
- 3D flip-card study mode
- Track cards as Known / Review / New
- Shuffle mode for varied practice

### ∑ Wolfram Alpha — Math & Science
- Full Wolfram Alpha query engine
- Step-by-step solutions
- Visual result pods (equations, graphs, tables)
- Query history for quick re-use
- Pre-built shortcuts for common problems

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS — no framework, no build step
- **Backend**: Node.js + Express — API proxy server
- **Math**: KaTeX (rendering) + Wolfram Alpha (computation)
- **Markdown**: marked.js + highlight.js
- **PDF parsing**: pdf-parse (server-side)
- **Storage**: Browser localStorage

---

## API Costs (approximate)

| Service | Pricing |
|---------|---------|
| OpenAI GPT-4o | ~$5/1M input tokens |
| OpenAI GPT-3.5 | ~$0.50/1M input tokens |
| Perplexity Sonar Large | ~$1/1M tokens |
| Anthropic Claude Sonnet | ~$3/1M input tokens |
| Wolfram Alpha | 2000 free calls/month |

Typical study session costs < $0.10.

---

## Project Structure

```
study-ai/
├── server.js          # Express backend (API proxy)
├── package.json
├── public/
│   ├── index.html     # App shell
│   ├── style.css      # Full dark-academic styles
│   └── app.js         # All frontend logic
└── README.md
```

---

## Privacy

- API keys stored in **your browser's localStorage only**
- No analytics, no telemetry, no external servers (except the AI APIs you choose to use)
- PDF content sent to your Perplexity API only when you explicitly use it in a query
