#!/usr/bin/env python3
import sys
import json

print("Python script started", file=sys.stderr)
print("Arguments:", sys.argv, file=sys.stderr)

# Simple test data
result = {
    "test": "success",
    "ticker": sys.argv[1] if len(sys.argv) > 1 else "UNKNOWN",
    "message": "Python script is working"
}

print(json.dumps(result))
print("Script completed", file=sys.stderr)
