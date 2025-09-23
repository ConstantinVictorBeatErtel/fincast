# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Next.js Application
- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint for code quality checks

### Python API Services
- `npm run py:serve` - Start local Python FastAPI server (requires virtual environment)
- `npm run py:tunnel` - Start localtunnel for Python API (development tunneling)

### Manual Python Setup
```bash
source venv/bin/activate
uvicorn python_api:app --host 127.0.0.1 --port 8000
```

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 14 with App Router, React 18, TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components (Radix UI primitives)
- **Backend**: Hybrid Next.js API routes + Python FastAPI
- **Data Sources**: Yahoo Finance via `yfinance` (Python) and `yahoo-finance2` (Node.js)
- **AI Integration**: Claude AI (Anthropic) for financial analysis and projections
- **Deployment**: Vercel with serverless functions

### Key Components

#### Financial Data Pipeline
- **Python Services**: `api/py-yf/index.py` and `scripts/fetch_yfinance.py` for primary financial data fetching
- **Node.js Fallback**: `app/api/yfinance-data/route.js` provides fallback when Python service fails
- **Currency Conversion**: Automatic currency conversion to USD for international stocks
- **Bank Detection**: Special handling for financial institutions with different valuation methods

#### API Structure
- **DCF Valuation**: `/api/dcf-valuation` - Main valuation endpoint with Claude AI integration
- **Portfolio Management**: `/api/portfolio*` - Portfolio CRUD operations
- **Financial Data**: `/api/yfinance-data` - Yahoo Finance data proxy
- **Company Data**: `/api/company-data` - Company profile and metrics

#### Frontend Architecture
- **App Router**: Next.js 14 app directory structure
- **Components**: Mix of `.js` and `.tsx` files in `app/components/`
- **UI Library**: shadcn/ui components in `components/ui/`
- **State Management**: React state with context providers

### Environment Configuration

Required environment variables (see `env.example`):
- `ANTHROPIC_API_KEY` - Claude AI API key for financial analysis
- `DATABASE_URL` - PostgreSQL connection (planned)
- `NEXTAUTH_*` - Authentication configuration (planned)
- `GOOGLE_CLIENT_*` - OAuth configuration (planned)

### Development Environment

#### Python Setup
- Virtual environment in `venv/` directory
- Dependencies: `yfinance`, `pandas`, `numpy`, `requests`
- FastAPI server for financial data endpoints

#### JavaScript/TypeScript
- Next.js with TypeScript support
- Path aliases configured: `@/*` maps to project root
- ESLint configuration for code quality

### Deployment Architecture

#### Vercel Configuration
- Next.js framework detection
- Python serverless functions in `api/py-yf/`
- Extended timeout (60s) for financial API calls
- Memory allocation (1024MB) for Python functions

#### Data Flow
1. Frontend requests financial data
2. Next.js API routes coordinate between services
3. Python services fetch from Yahoo Finance
4. Claude AI analyzes and projects financial data
5. Results formatted and returned to frontend

### Special Considerations

#### Financial Data Handling
- Automatic detection of bank stocks for specialized valuation
- Currency conversion for international equities
- Historical data fetching with 5-year price series
- Error handling with fallback to secondary data sources

#### Performance Optimizations
- Caching strategies for financial data
- Background data fetching
- Serverless function optimization for financial calculations

### Testing Approach
- Manual testing scripts in root directory (`test_*.js`, `test_*.py`)
- No formal test framework currently configured
- Test scripts validate Python API integration and data fetching

### File Organization
- `/app` - Next.js app router pages and API routes
- `/components` - Reusable UI components (shadcn/ui)
- `/scripts` - Python utilities for financial data
- `/api` - Vercel serverless functions (Python)
- `/lib` - Utility functions and configurations