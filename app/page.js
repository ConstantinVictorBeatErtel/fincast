'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import FinancialData from './components/FinancialData';
import DCFValuation from './components/DCFValuation';
import Portfolio from './components/Portfolio';

export default function Home() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState('valuation');

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' });
  };

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Fincast</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {session ? (
                <>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-700">Welcome, {session.user.name || session.user.email}</span>
                    <button
                      onClick={handleSignOut}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : (
                <a
                  href="/auth/signin"
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Sign in
                </a>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('valuation')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'valuation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Valuation Tool
            </button>
            {session && (
              <button
                onClick={() => setActiveTab('portfolio')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'portfolio'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Portfolio
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'valuation' && (
          <div>
            <h2 className="text-3xl font-bold text-center mb-8">Financial Valuation Tool</h2>
            <DCFValuation />
          </div>
        )}
        
        {activeTab === 'portfolio' && session && (
          <Portfolio />
        )}
        
        {activeTab === 'portfolio' && !session && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign in to access your portfolio</h2>
            <p className="text-gray-600 mb-6">Track your investments and view upside potential</p>
            <a
              href="/auth/signin"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Sign in
            </a>
          </div>
        )}
      </div>
    </main>
  );
}