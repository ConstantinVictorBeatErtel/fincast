import { redirect } from 'next/navigation';
import CompanyData from './components/CompanyData';

export default function Home() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Financial Dashboard</h1>
      <div className="grid grid-cols-1 gap-6">
        <CompanyData />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-2">Market Overview</h2>
            <p className="text-gray-600">Real-time market data coming soon...</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-2">Financial News</h2>
            <p className="text-gray-600">Latest financial updates...</p>
          </div>
        </div>
      </div>
    </div>
  );
}