# Fincast — Financial Valuation & Portfolio Management

AI-assisted equity valuation for public stocks: DCF and exit-multiple workflows with Claude-generated forward assumptions over live market data, plus authenticated portfolio tracking.

**Live app:** [fincast-agent.vercel.app](https://fincast-agent.vercel.app/)

## Features

### Financial valuation
- **DCF analysis** — discount rate, terminal growth, and five-year cash-flow projections
- **Exit multiple analysis** — P/E, EV/EBITDA, EV/FCF, and EV/Sales with AI-selected multiples
- **Two analysis modes** — Standard Forecast (~10s) and Agentic Analysis (~1–2 min with web research)
- **Excel export** — download valuation summaries and performance tables

### Portfolio management
- **User authentication** — email/password and Google OAuth via NextAuth.js
- **Portfolio tracking** — persist holdings in Postgres (Prisma)
- **Upside analysis** — fair value, upside %, and CAGR per holding

## Tech stack

- **Frontend:** Next.js 14, React, Tailwind CSS
- **Backend:** Next.js API routes, Claude via OpenRouter
- **Database:** Postgres via Prisma
- **Auth:** NextAuth.js
- **Deployment:** Vercel

## Getting started

### Prerequisites
- Node.js 18+
- npm
- OpenRouter API key (for Claude)
- Postgres database URL (for auth + portfolio)

### Installation

```bash
git clone https://github.com/ConstantinVictorBeatErtel/fincast.git
cd fincast
npm install
cp env.example .env.local
# fill in OPENROUTER_API_KEY, DATABASE_URL, NEXTAUTH_SECRET, etc.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Enter a ticker (e.g. AAPL, MSFT, NVDA)
2. Pick DCF or Exit Multiple, and Standard or Agentic mode
3. Click **Generate Valuation**
4. Sign in to save stocks to a portfolio and track valuations over time

## API

### `GET /api/dcf-valuation`

| Parameter | Description |
|-----------|-------------|
| `ticker` | Stock symbol (required) |
| `method` | `dcf` or `exit-multiple` (default: `dcf`) |
| `multiple` | `auto`, `P/E`, `EV/EBITDA`, etc. (default: `auto`) |

Example: `/api/dcf-valuation?ticker=AAPL&method=exit-multiple&multiple=P/E`

### `POST /api/dcf-valuation`

Regenerate with user feedback in the JSON body: `{ "feedback": "..." }`.

## Observability (Arize AX)

Both valuation routes can send traces to [Arize AX](https://arize.com). Tracing is off by default and turns on when `ARIZE_SPACE_ID` and `ARIZE_API_KEY` are set (see `env.example`); `ARIZE_PROJECT_NAME` defaults to `fincast`.

Each valuation request becomes one trace:

| Span | Kind | What it records |
|------|------|-----------------|
| `dcf-valuation` / `agentic-valuation` | CHAIN / AGENT | Ticker, method, multiple and feedback in; fair value, upside, CAGR and projections out |
| `fetch_financial_data` | TOOL | Data source used and latency |
| `generate_valuation`, `step1.initial_analysis` … `step4.validation` | CHAIN | Each forecast attempt or agent step, including sanity-check retries |
| `valuation_forecast`, `sonar.*`, `llm.*` | LLM | Prompt messages, answer, model, token counts, and failed model fallbacks |

The setup lives in `lib/server/tracing.js` and uses OpenTelemetry with the OpenInference attribute names. It needs Node.js 22.15+; on older runtimes, or if the packages fail to load, tracing disables itself and valuations run as usual.

## Project layout

| Path | Purpose |
|------|---------|
| `app/components/DCFValuation.js` | Main valuation UI (orchestrator) |
| `app/hooks/useDCFValuation.js` | Valuation state, API calls, retry logic |
| `app/lib/dcf/` | Formatters, response normalization, Excel export |
| `app/api/dcf-valuation/` | Standard valuation API |
| `app/api/agentic-valuation/` | Multi-step agentic valuation API |
| `app/api/portfolio/` | Portfolio CRUD |
| `app/api/auth/` | NextAuth routes |
| `lib/server/tracing.js` | Arize AX tracing helpers |
| `tests/` | Manual integration scripts (Yahoo Finance, Python API) |
| `python_service/` | Optional Python data helpers |

## License

MIT — see [LICENSE](LICENSE).
