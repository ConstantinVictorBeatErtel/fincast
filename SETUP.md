# Finbase Setup Guide

## Prerequisites

1. **Node.js 18+** installed
2. **Git** installed
3. **Claude AI API key** from Anthropic

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Prisma Client
```bash
npx prisma generate
```

### 3. Set up Environment Variables
Create a `.env.local` file in the root directory:

```env
# Database (for local development)
DATABASE_URL="postgresql://username:password@localhost:5432/finbase"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-key-here"

# Google OAuth (optional for local testing)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Claude AI
ANTHROPIC_API_KEY="your-claude-api-key"
```

### 4. Set up Local Database (Optional)
If you want to test with a local database:

```bash
# Install PostgreSQL locally or use Docker
# Then run:
npx prisma db push
```

### 5. Start Development Server
```bash
npm run dev
```

## Google OAuth Setup

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API

### 2. Create OAuth 2.0 Credentials
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application"
4. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (for local development)
   - `https://your-domain.vercel.app/api/auth/callback/google` (for production)
5. Copy the Client ID and Client Secret

### 3. Update Environment Variables
Add your Google credentials to `.env.local`:
```env
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

## Vercel Deployment Setup

### 1. Connect to Vercel
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Deploy the project

### 2. Set up Vercel Postgres Database
1. In Vercel dashboard, go to "Storage" > "Create Database"
2. Choose "Postgres"
3. Copy the connection string

### 3. Configure Environment Variables in Vercel
Add these environment variables in your Vercel project settings:

```env
DATABASE_URL="your-vercel-postgres-connection-string"
NEXTAUTH_URL="https://your-domain.vercel.app"
NEXTAUTH_SECRET="generate-a-random-secret-key"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
ANTHROPIC_API_KEY="your-claude-api-key"
```

### 4. Deploy Database Schema
After setting up the database, run:
```bash
npx prisma db push
```

## Testing Authentication

### Email/Password Authentication
1. Go to `/auth/signup` to create an account
2. Go to `/auth/signin` to sign in
3. Test portfolio features

### Google OAuth
1. Click "Sign in with Google" on the sign-in page
2. Complete Google OAuth flow
3. Test portfolio features

## Troubleshooting

### Prisma Client Error
If you see "Prisma client did not initialize yet":
```bash
npx prisma generate
npm run dev
```

### Database Connection Issues
1. Check your `DATABASE_URL` is correct
2. Ensure the database is accessible
3. Run `npx prisma db push` to sync schema

### Google OAuth Issues
1. Verify redirect URIs are correct
2. Check environment variables are set
3. Ensure Google+ API is enabled

## Features

✅ **Financial Valuation**
- DCF (Discounted Cash Flow) analysis
- Exit Multiple valuations (P/E, EV/EBITDA, EV/FCF, EV/Sales)
- AI-powered financial analysis using Claude
- Excel export functionality

✅ **Authentication**
- Email/password registration and login
- Google OAuth integration
- Secure session management

✅ **Portfolio Management**
- Add stocks to portfolio
- Track holdings and average prices
- View upside potential for each stock
- Portfolio summary dashboard

✅ **Professional UI**
- Modern, responsive design
- Tab-based navigation
- Professional financial data presentation
- Mobile-friendly interface 