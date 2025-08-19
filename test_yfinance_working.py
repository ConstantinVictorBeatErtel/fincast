#!/usr/bin/env python3
import yfinance as yf

def test_yfinance_methods():
    print("Testing yfinance methods...")
    
    ticker = yf.Ticker('AAPL')
    print("✓ Ticker created successfully")
    
    # Test different methods
    methods_to_test = [
        ('balance_sheet', 'balance_sheet'),
        ('income_stmt', 'income_stmt'),
        ('cash_flow', 'cash_flow'),
        ('dividends', 'dividends'),
        ('splits', 'splits'),
        ('actions', 'actions')
    ]
    
    for method_name, method_attr in methods_to_test:
        try:
            print(f"\nTesting {method_name}...")
            result = getattr(ticker, method_attr)
            if result is not None and hasattr(result, 'shape'):
                print(f"✓ {method_name}: {type(result)}, shape: {result.shape}")
            else:
                print(f"✓ {method_name}: {type(result)}")
        except Exception as e:
            print(f"✗ {method_name} failed: {e}")
    
    # Test download method
    try:
        print("\nTesting download method...")
        data = yf.download('AAPL', period='1d', progress=False)
        print(f"✓ Download: {type(data)}, shape: {data.shape}")
        if not data.empty:
            print(f"✓ Data available: {data.columns.tolist()}")
        else:
            print("⚠ Download returned empty data")
    except Exception as e:
        print(f"✗ Download failed: {e}")

if __name__ == "__main__":
    test_yfinance_methods()
