# Fincast - Financial Valuation & Portfolio Management

A comprehensive financial analysis platform that provides DCF (Discounted Cash Flow) and Exit Multiple valuations for stocks, with portfolio management capabilities.

## Features

### 🏦 Financial Valuation
- **DCF Analysis**: Discounted Cash Flow valuation with customizable discount rates and terminal growth
- **Exit Multiple Analysis**: P/E, EV/EBITDA, EV/FCF, and EV/Sales multiple valuations
- **AI-Powered Analysis**: Uses Claude AI to analyze financial data and generate projections
- **Real-time Data**: Fetches current market data and financial statements

### 📊 Portfolio Management
- **User Authentication**: Secure login with email/password and Google OAuth
- **Portfolio Tracking**: Add stocks to your portfolio and track valuations
- **Upside Analysis**: View potential upside and CAGR for each holding
- **Excel Export**: Download detailed valuation reports

### 🎯 Key Metrics
- **Fair Value**: Per-share or enterprise value calculations
- **Upside Potential**: Percentage gain from current price to fair value
- **CAGR**: Compound Annual Growth Rate projections
- **Financial Projections**: 5-year revenue, margin, and cash flow forecasts

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Claude AI API
- **Database**: Vercel Postgres (planned)
- **Authentication**: NextAuth.js (planned)
- **Deployment**: Vercel

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Claude AI API key

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd Fincast
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Add your Claude AI API key:
```
ANTHROPIC_API_KEY=your_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Basic Valuation
1. Enter a stock ticker (e.g., AAPL, MSFT, NVDA)
2. Select valuation method (DCF or Exit Multiple)
3. Click "Generate Valuation"
4. View detailed financial analysis and projections

### Portfolio Management (Coming Soon)
1. Create an account or sign in with Google
2. Add stocks to your portfolio
3. Track valuations and upside potential
4. Export portfolio reports

## API Endpoints

### GET /api/dcf-valuation
Generate a valuation for a stock.

**Parameters:**
- `ticker`: Stock symbol (required)
- `method`: Valuation method - 'dcf' or 'exit-multiple' (default: 'dcf')
- `multiple`: Exit multiple type - 'auto', 'P/E', 'EV/EBITDA', etc. (default: 'auto')

**Example:**
```
GET /api/dcf-valuation?ticker=AAPL&method=exit-multiple&multiple=P/E
```

### POST /api/dcf-valuation
Regenerate valuation with user feedback.

**Body:**
```json
{
  "feedback": "Please increase growth rate by 2% and use 35x P/E multiple"
}
```

## Deployment

This project is optimized for Vercel deployment:

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Roadmap

- [ ] User authentication with NextAuth.js
- [ ] Portfolio management with Vercel Postgres
- [ ] Real-time stock price updates
- [ ] Advanced financial metrics
- [ ] Mobile app
- [ ] Social features and sharing
