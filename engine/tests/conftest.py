from pathlib import Path
import sys


workspace = Path(__file__).resolve().parents[2]
if str(workspace) not in sys.path:
    sys.path.insert(0, str(workspace))

