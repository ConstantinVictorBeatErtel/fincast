import { redirect } from 'next/navigation';
import CompanyData from './components/CompanyData';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Financial Dashboard
          </h1>
          <p className="text-xl text-gray-600">
            Get real-time financial data for any company
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          <CompanyData />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Market Overview</h2>
              <p className="text-gray-600">Market data coming soon...</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Financial News</h2>
              <p className="text-gray-600">News feed coming soon...</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}