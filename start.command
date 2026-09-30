#!/bin/bash
cd "$(dirname "$0")" || exit 1
if [ -x .venv/bin/python ]; then
  exec .venv/bin/python server.py
elif [ -x /Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 ]; then
  exec /Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 server.py
else
  exec python3 server.py
fi
