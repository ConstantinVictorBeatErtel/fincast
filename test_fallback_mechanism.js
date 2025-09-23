#!/usr/bin/env node

/**
 * Test script to verify the fallback mechanism works
 * This simulates a production environment where PY_YF_URL fails
 */

const fetch = require('node-fetch');

async function testFallbackMechanism() {
  console.log('Testing fallback mechanism...');

  // Test ticker
  const ticker = 'AAPL';

  try {
    // Simulate production environment
    process.env.VERCEL = '1';
    process.env.NODE_ENV = 'production';
    process.env.PY_YF_URL = 'http://localhost:9999/invalid'; // This will fail

    console.log('Starting Next.js server for testing...');

    // Import the route handler
    const { GET } = require('./app/api/yfinance-data/route.js');

    // Create a mock request
    const request = {
      url: `http://localhost:3000/api/yfinance-data?ticker=${ticker}`,
      headers: {
        get: (name) => {
          if (name === 'host') return 'localhost:3000';
          return null;
        }
      }
    };

    console.log(`Testing fallback for ticker: ${ticker}`);
    const response = await GET(request);
    const data = await response.json();

    console.log('Response status:', response.status);
    console.log('Response data source:', data.source);
    console.log('Historical financials count:', data.historical_financials?.length || 0);

    if (data.source === 'yahoo-finance2-fallback' && data.historical_financials?.length > 0) {
      console.log('✅ Fallback mechanism working correctly!');
      console.log('Sample historical data:', data.historical_financials[0]);
    } else if (data.error) {
      console.log('❌ Fallback failed with error:', data.error);
    } else {
      console.log('⚠️ Unexpected response:', data);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

if (require.main === module) {
  testFallbackMechanism();
}

module.exports = { testFallbackMechanism };