'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import FinancialData from './components/FinancialData';

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [submittedTicker, setSubmittedTicker] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmittedTicker(ticker);
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center">Financial Analysis</h1>
        
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="flex gap-4">
            <Input
              type="text"
              placeholder="Enter ticker symbol (e.g., AAPL)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="flex-1"
            />
            <Button type="submit">Analyze</Button>
          </form>
        </Card>

        {submittedTicker && (
          <FinancialData ticker={submittedTicker} />
        )}
      </div>
    </main>
  );
}