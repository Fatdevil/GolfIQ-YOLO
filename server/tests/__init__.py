import sys
from pathlib import Path

from dotenv import load_dotenv

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root))
load_dotenv(root / ".env.test", override=True)
