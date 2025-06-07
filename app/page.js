'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { TrendingUp, DollarSign, Calculator, PieChart as PieChartIcon, Building2, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'

export default function FinancialDashboard() {
  const [companies, setCompanies] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [marketData, setMarketData] = useState(null)
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [companiesRes, forecastsRes, marketRes] = await Promise.all([
        fetch('/api/companies'),
        fetch('/api/forecasts'),
        fetch('/api/market')
      ])
      
      const companiesData = await companiesRes.json()
      const forecastsData = await forecastsRes.json()
      const marketDataRes = await marketRes.json()
      
      setCompanies(companiesData)
      setForecasts(forecastsData)
      setMarketData(marketDataRes)
      setSelectedCompany(companiesData[0] || null)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching data:', error)
      setLoading(false)
    }
  }

  const formatCurrency = (value) => {
    if (!value) return '$0'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (num >= 1e12) return `$${(num / 1e12).toFixed(1)}T`
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`
    return `$${num.toFixed(2)}`
  }

  const formatNumber = (value) => {
    if (!value) return '0'
    const num = typeof value === 'string' ? parseFloat(value) : value
    return num.toLocaleString()
  }

  // Calculate portfolio metrics
  const totalMarketCap = companies.reduce((sum, company) => {
    const marketCap = parseFloat(company.MarketCapitalization || 0)
    return sum + marketCap
  }, 0)

  const avgPERatio = companies.reduce((sum, company) => {
    const pe = parseFloat(company.PERatio || 0)
    return sum + pe
  }, 0) / (companies.length || 1)

  const topPerformers = companies
    .filter(company => company.ProfitMargin && parseFloat(company.ProfitMargin) > 0)
    .sort((a, b) => parseFloat(b.ProfitMargin) - parseFloat(a.ProfitMargin))
    .slice(0, 5)

  // Prepare sector data for pie chart
  const sectorData = companies.reduce((acc, company) => {
    const sector = company.Sector || 'Unknown'
    const marketCap = parseFloat(company.MarketCapitalization || 0)
    acc[sector] = (acc[sector] || 0) + marketCap
    return acc
  }, {})

  const pieData = Object.entries(sectorData).map(([sector, value]) => ({
    name: sector,
    value: value,
    percentage: ((value / totalMarketCap) * 100).toFixed(1)
  }))

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658']

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading financial data...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="text-blue-600" />
            Portfolio Analytics & Forecasting
          </h1>
          <p className="text-gray-600 mt-2">Real-time financial data and predictions for your portfolio</p>
          
          {/* Market Overview */}
          {marketData?.["Global Quote"] && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-blue-900">S&P 500 (SPY)</h3>
                  <p className="text-2xl font-bold text-blue-700">
                    ${parseFloat(marketData["Global Quote"]["05. price"]).toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-semibold ${
                    parseFloat(marketData["Global Quote"]["09. change"]) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {parseFloat(marketData["Global Quote"]["09. change"]) >= 0 ? '+' : ''}
                    {marketData["Global Quote"]["09. change"]} ({marketData["Global Quote"]["10. change percent"]})
                  </p>
                  <p className="text-sm text-gray-600">
                    Volume: {formatNumber(marketData["Global Quote"]["06. volume"])}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Portfolio Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Market Cap</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalMarketCap)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Companies Tracked</p>
                <p className="text-2xl font-bold text-green-600">{companies.length}</p>
              </div>
              <Building2 className="h-8 w-8 text-green-600" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg P/E Ratio</p>
                <p className="text-2xl font-bold text-purple-600">{avgPERatio.toFixed(1)}</p>
              </div>
              <Calculator className="h-8 w-8 text-purple-600" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Forecasts Generated</p>
                <p className="text-2xl font-bold text-orange-600">{forecasts.length}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top Performers */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Top Performers (Profit Margin)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topPerformers}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="Symbol" />
                <YAxis tickFormatter={(value) => `${(value * 100).toFixed(1)}%`} />
                <Tooltip formatter={(value) => [`${(value * 100).toFixed(2)}%`, 'Profit Margin']} />
                <Bar dataKey="ProfitMargin" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Sector Allocation */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Portfolio by Sector</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Company Selection */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Company Details</h3>
          <div className="mb-4">
            <select
              value={selectedCompany?.Symbol || ''}
              onChange={(e) => {
                const company = companies.find(c => c.Symbol === e.target.value)
                setSelectedCompany(company)
              }}
              className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a company...</option>
              {companies.map((company) => (
                <option key={company.Symbol} value={company.Symbol}>
                  {company.Symbol} - {company.Name || 'Unknown Company'}
                </option>
              ))}
            </select>
          </div>

          {selectedCompany && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Current Price</p>
                <p className="text-xl font-bold">${parseFloat(selectedCompany.Price || 0).toFixed(2)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Market Cap</p>
                <p className="text-xl font-bold">{formatCurrency(selectedCompany.MarketCapitalization)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">P/E Ratio</p>
                <p className="text-xl font-bold">{parseFloat(selectedCompany.PERatio || 0).toFixed(2)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Revenue</p>
                <p className="text-xl font-bold">{formatCurrency(selectedCompany.Revenue)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Forecasts Table */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Price Forecasts</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Predicted Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {forecasts.slice(0, 20).map((forecast) => (
                  <tr key={forecast.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {forecast.ticker}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(forecast.date), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${forecast.predicted}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        forecast.confidence > 80 ? 'bg-green-100 text-green-800' :
                        forecast.confidence > 70 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {forecast.confidence}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {forecast.model.replace('_', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
} 