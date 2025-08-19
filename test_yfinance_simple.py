#!/usr/bin/env python3
"""
Simple test file to check if yfinance works at all
"""
import yfinance as yf
import json

def test_basic_yfinance():
    """Test basic yfinance functionality"""
    print("=== Testing Basic yfinance ===")
    print(f"yfinance version: {yf.__version__}")
    
    # Test 1: Basic download
    print("\n--- Test 1: Basic download ---")
    try:
        hist = yf.download("AAPL", period="1d", progress=False)
        if hist is not None and not hist.empty:
            print(f"✓ Download works: {len(hist)} rows")
            print(f"  Last close: ${hist['Close'].iloc[-1]:.2f}")
        else:
            print("✗ Download returned empty data")
    except Exception as e:
        print(f"✗ Download failed: {e}")
    
    # Test 2: Ticker object
    print("\n--- Test 2: Ticker object ---")
    try:
        ticker = yf.Ticker("AAPL")
        print(f"✓ Ticker object created: {ticker.ticker}")
    except Exception as e:
        print(f"✗ Ticker creation failed: {e}")
    
    # Test 3: History method
    print("\n--- Test 3: History method ---")
    try:
        ticker = yf.Ticker("AAPL")
        hist = ticker.history(period="1d")
        if hist is not None and not hist.empty:
            print(f"✓ History works: {len(hist)} rows")
            print(f"  Last close: ${hist['Close'].iloc[-1]:.2f}")
        else:
            print("✗ History returned empty data")
    except Exception as e:
        print(f"✗ History failed: {e}")
    
    # Test 4: Info method
    print("\n--- Test 4: Info method ---")
    try:
        ticker = yf.Ticker("AAPL")
        info = ticker.info
        if info:
            print(f"✓ Info works: {len(info)} keys")
            print(f"  Company: {info.get('longName', 'N/A')}")
            print(f"  Price: ${info.get('currentPrice', 'N/A')}")
        else:
            print("✗ Info returned empty data")
    except Exception as e:
        print(f"✗ Info failed: {e}")
    
    # Test 5: Fast info
    print("\n--- Test 5: Fast info ---")
    try:
        ticker = yf.Ticker("AAPL")
        if hasattr(ticker, 'fast_info'):
            fast = ticker.fast_info
            if fast:
                print(f"✓ Fast info works: {len(fast)} keys")
                print(f"  Price: ${fast.get('lastPrice', 'N/A')}")
            else:
                print("✗ Fast info returned empty data")
        else:
            print("✗ Fast info not available")
    except Exception as e:
        print(f"✗ Fast info failed: {e}")
    
    # Test 6: Financials
    print("\n--- Test 6: Financials ---")
    try:
        ticker = yf.Ticker("AAPL")
        fin = ticker.financials
        if fin is not None and not fin.empty:
            print(f"✓ Financials works: {fin.shape}")
            print(f"  Columns: {list(fin.columns)}")
        else:
            print("✗ Financials returned empty data")
    except Exception as e:
        print(f"✗ Financials failed: {e}")
    
    # Test 7: Different ticker
    print("\n--- Test 7: Different ticker (MSFT) ---")
    try:
        ticker = yf.Ticker("MSFT")
        hist = ticker.history(period="1d")
        if hist is not None and not hist.empty:
            print(f"✓ MSFT History works: {len(hist)} rows")
            print(f"  Last close: ${hist['Close'].iloc[-1]:.2f}")
        else:
            print("✗ MSFT History returned empty data")
    except Exception as e:
        print(f"✗ MSFT History failed: {e}")

if __name__ == "__main__":
    test_basic_yfinance()
