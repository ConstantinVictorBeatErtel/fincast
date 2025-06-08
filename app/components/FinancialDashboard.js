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
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const response = await fetch('/api/financial-data')
      if (!response.ok) {
        throw new Error('Failed to fetch data')
      }
      const data = await response.json()
      setCompanies(data.companies || [])
      setForecasts(data.forecasts || [])
      setMarketData(data.marketData || null)
      setSelectedCompany(data.companies[0] || null)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching data:', error)
      setError(error.message)
      setLoading(false)
    }
  }

  // ... rest of the component code ...
} 