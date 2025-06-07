'use client';

import { useEffect, useState } from 'react';

interface Company {
  Symbol: string;
  Revenue: number;
  NetIncome: number;
  GrossProfit: number;
  OperatingIncome: number;
  TotalAssets: number;
  TotalLiabilities: number;
  TotalEquity: number;
  Price: number;
  Volume: number;
  MarketCapitalization: number;
  ProfitMargin: number;
  GrossMargin: number;
  OperatingMargin: number;
  PERatio: number;
  Date: string;
}

export default function FinancialDashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/financial-data');
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const data = await response.json();
        setCompanies(data.companies);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading financial data...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((company) => (
          <div key={company.Symbol} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">{company.Symbol}</h2>
            <div className="space-y-2">
              <p>Price: ${company.Price.toFixed(2)}</p>
              <p>Market Cap: ${(company.MarketCapitalization / 1e9).toFixed(2)}B</p>
              <p>P/E Ratio: {company.PERatio?.toFixed(2) || 'N/A'}</p>
              <p>Profit Margin: {(company.ProfitMargin * 100).toFixed(2)}%</p>
              <p>Revenue: ${(company.Revenue / 1e9).toFixed(2)}B</p>
              <p>Net Income: ${(company.NetIncome / 1e9).toFixed(2)}B</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 