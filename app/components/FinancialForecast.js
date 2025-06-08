'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Loader2 } from "lucide-react";

export default function FinancialForecast() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);

  const formatCurrency = (value) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setForecast(null);

    try {
      const response = await fetch(`/api/generate-forecast?ticker=${encodeURIComponent(ticker)}`);
      if (!response.ok) {
        throw new Error('Failed to generate forecast');
      }
      const data = await response.json();
      setForecast(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Financial Forecast</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ticker">Stock Ticker</Label>
            <Input
              id="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter ticker symbol (e.g., AAPL)"
              required
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Forecast...
              </>
            ) : (
              'Generate Forecast'
            )}
          </Button>
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {forecast && (
          <div className="mt-6 space-y-6">
            {Object.entries(forecast).map(([year, data]) => (
              <div key={year} className="space-y-4">
                <h3 className="text-lg font-semibold">{year}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Revenue</p>
                    <p className="text-lg font-medium">{formatCurrency(data.Revenue)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Gross Profit</p>
                    <p className="text-lg font-medium">{formatCurrency(data.GrossProfit)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">EBIT</p>
                    <p className="text-lg font-medium">{formatCurrency(data.EBIT)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Net Income</p>
                    <p className="text-lg font-medium">{formatCurrency(data.NetIncome)}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500">Free Cash Flow</p>
                    <p className="text-lg font-medium">{formatCurrency(data.FreeCashFlow)}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">Analysis</p>
                  <p className="text-sm">{data.Explanation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 