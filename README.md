# StudyStack AI — Multi-AI Study Platform

## Project Structure

```
studyai/
├── .gitignore
├── README.md
├── frontend/
│   └── index.html              # Entire frontend (React + Babel loaded from CDN)
└── backend/
    ├── server.js                # Express entry point
    ├── package.json             # Dependencies
    ├── .env.example             # API keys template (copy to .env)
    ├── config/
    │   └── db.js                # SQLite database + schema
    ├── middleware/
    │   ├── auth.js              # JWT authentication
    │   └── tokens.js            # Token usage tracking + limits
    └── routes/
        ├── auth.js              # Signup / Login / User info
        ├── ai.js                # 5 AI proxy routes
        └── stripe.js            # Checkout + webhook
```

## Quick Start

### Frontend
Open `frontend/index.html` in your browser. No install needed — React and Babel load from CDN.

Click **"Preview Demo"** to explore everything without a backend.

### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```
Fill in your API keys in `.env` first. Runs at **http://localhost:4000**.

## API Keys Needed

Get keys from: OpenAI, Perplexity, Anthropic, Wolfram Alpha, and Stripe.
See `backend/.env.example` for the full list.

## Features

- 5 AI engines (GPT-5.4, Perplexity, Claude, GPT-4o Mini, Wolfram)
- Interactive flashcards with flip, Know It / Study Again sorting
- Save any AI response to Study Organizer with full-page detail view
- Token-based subscriptions via Stripe (Free / $9 Student / $29 Pro)
- Dark and Light mode
- Email signup required for all plans
