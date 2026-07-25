#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ignition Telegram bot — manual runner (foreground).
#
# For PRODUCTION, prefer the supervisor program (ignition-telegram-bot.conf) so
# it's monitored and auto-restarted. Use this script only for a quick manual
# test on the server, or as a fallback.
#
# Usage (override any of these as needed):
#   BENCH_PATH=/home/frappe/frappe-bench \
#   HIVE_SITE=erp2.v12infotech.com \
#   ./run-telegram-bot.sh
#
# Runs in the foreground; Ctrl-C to stop. To daemonize without supervisor:
#   setsid nohup ./run-telegram-bot.sh >> "$BENCH_PATH/logs/telegram-bot.log" 2>&1 &
# ---------------------------------------------------------------------------
set -euo pipefail

BENCH_PATH="${BENCH_PATH:-/home/frappe/frappe-bench}"
export HIVE_SITE="${HIVE_SITE:-erp2.v12infotech.com}"
export HIVE_SITES_PATH="${HIVE_SITES_PATH:-$BENCH_PATH/sites}"

PY="$BENCH_PATH/env/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "ERROR: python not found at $PY — set BENCH_PATH to your frappe-bench dir." >&2
  exit 1
fi

# Guard against a second poller on the same bot token (Telegram allows only one).
if pgrep -f "[b]wh_hive.bwh_hive.telegram_bot" >/dev/null 2>&1; then
  echo "ERROR: a telegram_bot process is already running (Telegram allows only one poller per token)." >&2
  echo "       Stop it first (supervisorctl stop ignition-telegram-bot, or kill the process)." >&2
  exit 1
fi

cd "$HIVE_SITES_PATH"
echo "Starting Ignition Telegram bot  site=$HIVE_SITE  bench=$BENCH_PATH"
exec "$PY" -u -m bwh_hive.bwh_hive.telegram_bot
