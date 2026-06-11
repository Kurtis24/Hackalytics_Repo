# Hackalytics_Repo

## Startup

**Frontend:**
```bash
source ~/.nvm/nvm.sh && nvm use 20
npm i
npm run dev
```

**Backend (required for API and for cron):**
```bash
cd Backend
source venv/bin/activate   # or: .\venv\Scripts\activate on Windows
pip install -r requirements.txt
python main.py
```

The frontend talks to the backend at `VITE_API_URL` (default `http://localhost:9000/api/v1`). For the **monthly Vercel cron** to work, the backend must be reachable from the internet (e.g. deployed on Railway, Render, or another host). The cron runs on Vercel’s servers and calls `BACKEND_URL`; it cannot call `localhost`. So you need **two** things: the frontend (e.g. on Vercel) and a **separate running backend** with a public URL.

## How it works (fully native)

There is **no external data warehouse or cloud ML service** — everything runs locally:

- **Games** come from public sports APIs (ESPN / MLB / NHL). If those are unreachable, the backend falls back to built-in sample data so it still runs offline.
- **Odds** are generated locally per game.
- **Predictions** run a trained PyTorch model (`TemporalArbitrageScorer`) on CPU from the checkpoint at `Backend/models/model.ckpt`.
- **Arbitrage** sizing/scoring is plain Python (`arbitrage_service`, `analysis_service`).

No API keys are required to run the backend. `Backend/.env` is optional — see `Backend/.env.example` for the few optional settings (Supabase persistence, a RapidAPI odds key, a custom model checkpoint path).

## Prediction-market arbitrage (Polymarket + Kalshi)

The backend also scans two public prediction markets — **Polymarket** (Gamma API) and **Kalshi** (market-data API) — for arbitrage. Both are public and need **no API keys**.

Endpoints (all under `/api/v1`):

- `GET /prediction-markets/polymarket?limit=100` — live Polymarket binary markets with normalized Yes/No prices.
- `GET /prediction-markets/kalshi?limit=100` — live Kalshi binary markets.
- `GET /prediction-markets/arbitrage` — scans both venues and returns guaranteed-profit opportunities. Query params: `limit`, `min_margin` (e.g. `0.01` for 1%), `match_threshold`, `include_cross`, and `query` (focus the scan on a topic, e.g. `?query=world cup`).
- `GET /prediction-markets/arbitrage/nodes` — same scan shaped as graph nodes for the 3D view.

How arbitrage is found:

- **Intra-venue:** a single market where buying YES and NO together costs under $1 (`yes_ask + no_ask < 1`). Locks in `1 − cost` regardless of outcome.
- **Cross-venue:** the same real-world event listed on both venues — buy YES on the cheaper side and NO on the other. Prices each pay out $1, so any combined cost under $1 is locked profit.

Important: true arbitrage is rare. Intra-venue rarely clears because of the bid/ask spread, and cross-venue requires the *same* event on both platforms. Cross-venue matches are made by question similarity (deliberately strict to avoid false signals) and are flagged `requires_verification: true` — **confirm both questions resolve on the identical outcome before trading.** Use `?query=<topic>` to focus the scan where overlap is likely (elections, Bitcoin price, a specific championship).

## Vercel cron (monthly arbitrage/execute)

The monthly cron hits `GET /api/v1/arbitrage/execute` on the Vercel deployment. The serverless proxy at `api/v1/arbitrage/execute.js` forwards that as **POST** to your backend’s `/api/v1/arbitrage/execute` (run the pipeline: games → ML → nodes).

- **Backend must be running somewhere public.** The cron runs on Vercel; it cannot call `localhost`. Deploy the backend (e.g. Railway, Render, Fly.io) and get its URL.
- In the Vercel project, set **BACKEND_URL** to that URL (e.g. `https://your-app.up.railway.app`), no trailing slash. The proxy will call `BACKEND_URL/api/v1/arbitrage/execute`.
