import os
import sys
import json
import traceback
from pathlib import Path

def main():
    try:
        # Get the ticker from command line arguments
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Ticker is required"}))
            sys.exit(1)
        
        ticker = sys.argv[1]
        
        # Get the directory of this script
        script_dir = Path(__file__).parent.absolute()
        print(f"Script directory: {script_dir}", file=sys.stderr)
        
        # Change to the script directory
        os.chdir(script_dir)
        print(f"Current working directory: {os.getcwd()}", file=sys.stderr)
        
        # Print Python path for debugging
        print(f"Python path: {sys.path}", file=sys.stderr)
        
        # Import and run the main script
        try:
            print("Attempting to import fetch_company_data...", file=sys.stderr)
            from fetch_company_data import fetch_company_data
            print("Successfully imported fetch_company_data", file=sys.stderr)
            
            print(f"Fetching data for ticker: {ticker}", file=sys.stderr)
            result = fetch_company_data(ticker)
            print(json.dumps(result))
        except ImportError as e:
            print(f"Import error: {str(e)}", file=sys.stderr)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
            print(json.dumps({"error": f"Import error: {str(e)}"}))
            sys.exit(1)
        except Exception as e:
            print(f"Error: {str(e)}", file=sys.stderr)
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
            print(json.dumps({"error": str(e)}))
            sys.exit(1)
    except Exception as e:
        print(f"Critical error: {str(e)}", file=sys.stderr)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        print(json.dumps({"error": f"Critical error: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main() 