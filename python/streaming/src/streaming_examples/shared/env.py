from __future__ import annotations

import os
from pathlib import Path


def load_root_env() -> None:
    """Load the cookbook root .env file without overriding existing env vars."""
    env_path = Path(__file__).resolve().parents[5] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)
