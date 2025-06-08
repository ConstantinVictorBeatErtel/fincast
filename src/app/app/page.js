export default function AppPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Financial Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-2">Market Overview</h2>
          <p className="text-gray-600">Real-time market data coming soon...</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-2">Portfolio</h2>
          <p className="text-gray-600">Your portfolio analytics...</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-2">Financial News</h2>
          <p className="text-gray-600">Latest financial updates...</p>
        </div>
      </div>
    </div>
  );
} 