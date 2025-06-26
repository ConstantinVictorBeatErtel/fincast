'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import FinancialData from './components/FinancialData';
import DCFValuation from './components/DCFValuation';

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [submittedTicker, setSubmittedTicker] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmittedTicker(ticker);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8">
        <h1 className="text-3xl font-bold text-center mb-8">DCF Valuation Tool</h1>
        <DCFValuation />
      </div>
    </main>
  );
}