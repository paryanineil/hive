# Ignition Telegram bot — production deployment (erp2.v12infotech.com)

Long-polling bot (no webhook, no public URL). Runs as a supervisor-managed
worker on the production bench. Reuses the `telegram_bot_token` in Hive Settings.

## ⚠️ Read first: one token = one poller

Telegram allows **only one** `getUpdates` poller per bot token at a time. The
**dev machine is currently polling `@v12tasksbot`**. Do **one** of:

- **Recommended:** create a **separate** bot in @BotFather for production
  (e.g. `@v12tasks_prod_bot`) and use its token on prod. Dev keeps working.
- Or **stop the dev bot** before starting prod with the same token.

Running both with the same token → 409 Conflict, messages split randomly.

## Prerequisites

1. **App code deployed.** The bot ships in the `main` branch. On the prod bench:
   ```bash
   cd <bench>/apps/bwh_hive && git fetch && git checkout main && git pull
   cd <bench> && bench --site erp2.v12infotech.com migrate   # adds Start/End Date cols (additive)
   bench build && bench --site erp2.v12infotech.com clear-cache
   sudo supervisorctl restart all   # picks up the app changes
   ```
   NOTE: `main` also contains the Hive→Ignition rebrand, so after deploy the app
   is served at **/ignition** (was /hive) with the new name/logo/theme. ERPNext
   on the same site is unaffected.

2. **Token set** in the production site's Hive Settings:
   ```bash
   bench --site erp2.v12infotech.com console
   >>> s = frappe.get_single("Hive Settings")
   >>> s.telegram_bot_token = "<PROD_BOT_TOKEN>"
   >>> s.telegram_default_chat_id = None   # let you re-bind as owner via /start
   >>> s.save(); frappe.db.commit()
   ```
   (Owner lock and authorized groups are per-site; you'll re-`/start` and
   re-tag the bot in your group on prod.)

## Install the supervisor program

1. Find your real values on the server:
   ```bash
   whoami                 # -> the `user=` value (usually: frappe)
   cd <your frappe-bench> && pwd   # -> the bench path
   ls env/bin/python      # confirm the python exists
   ```
2. Edit `ignition-telegram-bot.conf` — replace `/home/frappe/frappe-bench`,
   `user=frappe`, and the site name if different.
3. Install and start:
   ```bash
   sudo cp scripts/telegram-bot/ignition-telegram-bot.conf /etc/supervisor/conf.d/
   sudo supervisorctl reread
   sudo supervisorctl update
   sudo supervisorctl status ignition-telegram-bot
   ```
4. Watch it come up:
   ```bash
   tail -f <bench>/logs/telegram-bot.log
   # expect: "Ignition Telegram bot started. bot=@... owner=None groups=[]"
   ```
5. In Telegram, send `/start` to the prod bot to bind yourself as owner, then
   `/projects` to confirm it reads production data.

## Manual run (testing / no supervisor)

```bash
BENCH_PATH=/home/frappe/frappe-bench HIVE_SITE=erp2.v12infotech.com \
  scripts/telegram-bot/run-telegram-bot.sh
```

## Operations

```bash
sudo supervisorctl restart ignition-telegram-bot   # after code changes
sudo supervisorctl stop ignition-telegram-bot
sudo supervisorctl tail -f ignition-telegram-bot    # live logs
```

The program has `autostart=true` + `autorestart=true`, so it survives reboots
and crashes. It survives `bench setup supervisor` because it lives in its own
conf file, not the bench-generated one.
