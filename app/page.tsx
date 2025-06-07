import { Suspense } from 'react';
import FinancialDashboard from './components/FinancialDashboard';

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-8">Financial Dashboard</h1>
      <Suspense fallback={<div>Loading dashboard...</div>}>
        <FinancialDashboard />
      </Suspense>
    </main>
  );
}
