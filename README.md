# Hackalytics_Repo

## Startup

**Frontend:**
```bash
source ~/.nvm/nvm.sh && nvm use 20
npm run dev
```

**Backend (required for API and for cron):**
```bash
cd Backend
source venv/bin/activate   # or: .\venv\Scripts\activate on Windows
python main.py
```

The frontend talks to the backend at `VITE_API_URL` (default `http://localhost:9000/api/v1`). For the **monthly Vercel cron** to work, the backend must be reachable from the internet (e.g. deployed on Railway, Render, or another host). The cron runs on Vercel’s servers and calls `BACKEND_URL`; it cannot call `localhost`. So you need **two** things: the frontend (e.g. on Vercel) and a **separate running backend** with a public URL.

## Setup for Databricks SDK

In your `Backend/.env` file, add:

```env
DATABRICKS_CLIENT_ID=<client_id>
DATABRICKS_CLIENT_SECRET=<client_secret>
MODEL_EXECUTION_MODE=remote
```

## Vercel cron (monthly arbitrage/execute)

The monthly cron hits `GET /api/v1/arbitrage/execute` on the Vercel deployment. The serverless proxy at `api/v1/arbitrage/execute.js` forwards that as **POST** to your backend’s `/api/v1/arbitrage/execute` (run the pipeline: games → ML → nodes).

- **Backend must be running somewhere public.** The cron runs on Vercel; it cannot call `localhost`. Deploy the backend (e.g. Railway, Render, Fly.io) and get its URL.
- In the Vercel project, set **BACKEND_URL** to that URL (e.g. `https://your-app.up.railway.app`), no trailing slash. The proxy will call `BACKEND_URL/api/v1/arbitrage/execute`.
