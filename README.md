# Jev Playground

A small website for trying TypeSafe's Jev model: write a state (text or JSON), define
Noul / Choice / Score questions, and see typed answers, probabilities, and confidence.

## Run

```bash
echo "TYPESAFE_API_KEY=your_key_here" > .env
npm start
```

Then open http://localhost:3000. Requires Node 18+; no dependencies.

## How it works

- `public/index.html` — the whole UI (question builder, examples, results).
- `server.js` — serves the UI and proxies `POST /api/ask` to
  `https://api.typesafe.ai/v1/systemone` with the key from `.env`, so the key never
  reaches the browser.

Add your own examples to the `PRESETS` object in `public/index.html`.
