import sys
import os
import json

def main():
    info = {
        "python_version": sys.version,
        "python_path": sys.path,
        "current_directory": os.getcwd(),
        "environment_variables": {
            "PYTHONPATH": os.environ.get("PYTHONPATH", "Not set"),
            "PYTHONNOUSERSITE": os.environ.get("PYTHONNOUSERSITE", "Not set"),
            "VERCEL": os.environ.get("VERCEL", "Not set")
        },
        "installed_packages": []
    }
    
    try:
        import pkg_resources
        info["installed_packages"] = [f"{dist.key}=={dist.version}" for dist in pkg_resources.working_set]
    except ImportError:
        info["installed_packages"] = ["pkg_resources not available"]
    
    print(json.dumps(info, indent=2))

if __name__ == "__main__":
    main() 