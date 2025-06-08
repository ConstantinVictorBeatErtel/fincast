import { redirect } from 'next/navigation';
import CompanyData from './components/CompanyData';
import FinancialForecast from './components/FinancialForecast';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Financial Analysis Dashboard
          </h1>
          <p className="text-xl text-gray-600">
            Get real-time financial data and AI-powered forecasts for any company
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <CompanyData />
          <FinancialForecast />
        </div>
      </div>
    </main>
  );
}