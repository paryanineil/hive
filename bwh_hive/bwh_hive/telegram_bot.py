# Copyright (c) 2026, BWH Studios and contributors
# For license information, please see license.txt

"""Interactive Telegram bot for Ignition (Hive).

Long-polling daemon (no public URL / webhook needed). Works in private chats and
in team groups: create projects and tasks through a guided chat flow, and query
data with commands.

Run standalone (from the bench):
    cd sites && ../env/bin/python -u -m bwh_hive.bwh_hive.telegram_bot

Access model:
  - Owner: the first user to /start (DM or group) is remembered in
    `telegram_default_chat_id` (Telegram user id). The owner is the admin.
  - Groups: a group becomes usable when the OWNER tags/commands the bot in it
    (auto-authorized, stored in logs/telegram_groups.json). Then any member of
    that group can use the bot. Unauthorized groups are ignored silently.

Group requirement: disable the bot's privacy mode in BotFather
(/setprivacy -> Disable) so it can read the step-by-step flow answers.
"""

import re
import time
import datetime
import html
import json
import os

import requests
import frappe

SITE = os.environ.get("HIVE_SITE", "pms.localhost")
SITES_PATH = os.environ.get("HIVE_SITES_PATH", "/home/kamal/benches/hive/sites")
API_BASE = "https://api.telegram.org"
LOGS_DIR = os.path.join(SITES_PATH, "..", "logs")
OFFSET_FILE = os.path.join(LOGS_DIR, "telegram_bot_offset")
GROUPS_FILE = os.path.join(LOGS_DIR, "telegram_groups.json")

PRIORITY_DEFAULT = "Medium"

# Runtime globals
BOT_USERNAME = None
BOT_ID = None
AUTHORIZED_GROUPS: set = set()
STATE: dict = {}                       # keyed by "<chat_id>:<user_id>"
_CTX = {"reply_to": None, "selective": False}   # per-update reply context


# ---------------------------------------------------------------- infra
_TOKEN_CACHE: str | None = None


def _token() -> str | None:
    """Bot token, read once and cached.

    Re-reading it per API call would open a DB transaction before every 30s long
    poll, pinning it for the whole poll and blocking DDL (see release_db).
    Changing the token in Hive Settings therefore needs a bot restart.
    """
    global _TOKEN_CACHE
    if _TOKEN_CACHE is None:
        _TOKEN_CACHE = frappe.get_single("Hive Settings").get_password(
            "telegram_bot_token", raise_exception=False
        )
    return _TOKEN_CACHE


def tg(method: str, **params):
    token = _token()
    if not token:
        return None
    try:
        r = requests.post(f"{API_BASE}/bot{token}/{method}", json=params, timeout=40)
        return r.json()
    except Exception as e:
        print("tg api error:", method, e, flush=True)
        return None


def send(chat_id, text, buttons=None, remove_kb=False):
    """Send an HTML message, honouring the current reply context (groups)."""
    reply_markup = None
    if buttons:
        reply_markup = {
            "keyboard": [[{"text": b} for b in row] for row in buttons],
            "resize_keyboard": True,
            "one_time_keyboard": True,
        }
    elif remove_kb:
        reply_markup = {"remove_keyboard": True}
    if reply_markup is not None and _CTX["selective"]:
        reply_markup["selective"] = True
    params = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if _CTX["reply_to"]:
        params["reply_to_message_id"] = _CTX["reply_to"]
        params["allow_sending_without_reply"] = True
    if reply_markup is not None:
        params["reply_markup"] = reply_markup
    return tg("sendMessage", **params)


def esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def ensure_db():
    try:
        frappe.db.sql("SELECT 1")
    except Exception:
        frappe.connect()


def release_db():
    """End the idle transaction between polls.

    MariaDB opens a transaction on the first statement and holds it until commit
    or rollback. A long-lived poller therefore pins a transaction indefinitely,
    which blocks DDL (`bench migrate` fails with "Waiting for table metadata
    lock"). Rolling back when idle keeps the connection but frees the lock.
    """
    try:
        frappe.db.rollback()
    except Exception:
        pass


def read_offset() -> int:
    try:
        with open(OFFSET_FILE) as f:
            return int(f.read().strip() or 0)
    except Exception:
        return 0


def write_offset(v: int):
    try:
        with open(OFFSET_FILE, "w") as f:
            f.write(str(v))
    except Exception:
        pass


# ---------------------------------------------------------------- access control
def owner_user_id():
    v = frappe.db.get_single_value("Hive Settings", "telegram_default_chat_id")
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def bind_owner(user_id):
    frappe.db.set_value("Hive Settings", "Hive Settings", "telegram_default_chat_id", str(user_id))
    frappe.db.commit()


def is_owner(user_id) -> bool:
    o = owner_user_id()
    return o is not None and o == user_id


def load_groups():
    global AUTHORIZED_GROUPS
    try:
        with open(GROUPS_FILE) as f:
            AUTHORIZED_GROUPS = set(json.load(f))
    except Exception:
        AUTHORIZED_GROUPS = set()


def authorize_group(chat_id):
    AUTHORIZED_GROUPS.add(chat_id)
    try:
        with open(GROUPS_FILE, "w") as f:
            json.dump(sorted(AUTHORIZED_GROUPS), f)
    except Exception as e:
        print("save groups error:", e, flush=True)


# ---------------------------------------------------------------- data helpers
def project_types():
    return frappe.get_all("Hive Project Type", filters={"is_archived": 0}, pluck="name")


def open_projects():
    return frappe.get_all(
        "Hive Project", filters={"is_archived": 0},
        fields=["name", "title", "status"], order_by="creation asc",
    )


def members():
    return frappe.get_all(
        "Hive Member", filters={"is_active": 1}, fields=["name", "member_name", "user"],
    )


def parse_date(text: str):
    t = (text or "").strip().lower()
    if t in ("skip", "-", "none", ""):
        return ""
    if t == "today":
        return frappe.utils.today()
    if t == "tomorrow":
        return frappe.utils.add_days(frappe.utils.today(), 1)
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.datetime.strptime(text.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def chunk(lst, n):
    return [lst[i:i + n] for i in range(0, len(lst), n)]


# ---------------------------------------------------------------- view commands
def cmd_help(chat_id):
    send(chat_id,
         "<b>Ignition bot</b>\n\n"
         "<b>Create</b>\n"
         "/newproject – guided project creation\n"
         "/newtask – guided task creation\n\n"
         "<b>View</b>\n"
         "/projects – all projects\n"
         "/tasks – open tasks\n"
         "/mytasks – assigned open tasks\n"
         "/project &lt;name&gt; – one project + its tasks\n\n"
         "/cancel – stop the current step\n\n"
         "<i>In a group, tag me (@bot) or use a /command.</i>",
         remove_kb=True)


def cmd_projects(chat_id):
    rows = open_projects()
    if not rows:
        send(chat_id, "No projects yet. Use /newproject to add one.")
        return
    lines = ["<b>Projects</b>"]
    for p in rows:
        n = frappe.db.count("Hive Task", {"project": p.name, "is_archived": 0})
        done = frappe.db.count("Hive Task", {"project": p.name, "is_archived": 0, "status": "Done"})
        lines.append(f"• <b>{esc(p.title or p.name)}</b> — {esc(p.status)} · {done}/{n} done")
    send(chat_id, "\n".join(lines))


def cmd_tasks(chat_id):
    rows = frappe.get_all(
        "Hive Task",
        filters={"is_archived": 0, "status": ["!=", "Done"]},
        fields=["name", "title", "status", "priority", "project", "due_date"],
        order_by="due_date asc", limit_page_length=30,
    )
    if not rows:
        send(chat_id, "No open tasks. 🎉")
        return
    lines = ["<b>Open tasks</b>"]
    for t in rows:
        due = f" · due {t.due_date}" if t.due_date else ""
        lines.append(f"• <b>{esc(t.title)}</b> — {esc(t.status)}/{esc(t.priority)}{esc(due)}")
    send(chat_id, "\n".join(lines))


def cmd_mytasks(chat_id):
    rows = frappe.get_all(
        "Hive Task",
        filters={"is_archived": 0, "status": ["!=", "Done"], "_assign": ["is", "set"]},
        fields=["name", "title", "status", "_assign"],
        order_by="due_date asc", limit_page_length=30,
    )
    if not rows:
        send(chat_id, "No assigned open tasks.")
        return
    lines = ["<b>Assigned open tasks</b>"]
    for t in rows:
        who = ", ".join(json.loads(t._assign or "[]"))
        lines.append(f"• <b>{esc(t.title)}</b> — {esc(t.status)} · {esc(who)}")
    send(chat_id, "\n".join(lines))


def cmd_project_detail(chat_id, query):
    query = (query or "").strip().lower()
    match = None
    for p in open_projects():
        if query and (query in (p.title or "").lower() or query in p.name.lower()):
            match = p
            break
    if not match:
        send(chat_id, f"No project matching “{esc(query)}”. Try /projects.")
        return
    doc = frappe.get_doc("Hive Project", match.name)
    tasks = frappe.get_all(
        "Hive Task", filters={"project": match.name, "is_archived": 0},
        fields=["title", "status"], order_by="status asc", limit_page_length=40,
    )
    lines = [f"<b>{esc(doc.title)}</b> ({esc(doc.status)})"]
    if doc.get("start_date") or doc.get("end_date"):
        lines.append(f"🗓 {esc(doc.get('start_date') or '?')} → {esc(doc.get('end_date') or '?')}")
    if doc.project_type:
        lines.append(f"Type: {esc(doc.project_type)}")
    lines.append(f"\n<b>Tasks ({len(tasks)})</b>")
    for t in tasks:
        lines.append(f"• {esc(t.title)} — {esc(t.status)}")
    send(chat_id, "\n".join(lines))


# ---------------------------------------------------------------- create flows
def start_project(state_key, chat_id):
    STATE[state_key] = {"flow": "project", "step": "name", "data": {}}
    send(chat_id, "🆕 <b>New project</b>\nWhat's the project name?", remove_kb=True)


def start_task(state_key, chat_id):
    if not open_projects():
        send(chat_id, "No projects yet — create one first with /newproject.")
        return
    STATE[state_key] = {"flow": "task", "step": "title", "data": {}}
    send(chat_id, "🆕 <b>New task</b>\nWhat's the task title?", remove_kb=True)


def handle_flow(state_key, chat_id, text) -> bool:
    st = STATE.get(state_key)
    if not st:
        return False
    flow, step, data = st["flow"], st["step"], st["data"]

    if text.strip().lower() in ("/cancel", "cancel", "❌ cancel"):
        STATE.pop(state_key, None)
        send(chat_id, "Cancelled.", remove_kb=True)
        return True

    if flow == "project":
        if step == "name":
            data["title"] = text.strip()
            st["step"] = "start_date"
            send(chat_id, "Start date? (e.g. 2026-08-01, today, tomorrow, or Skip)",
                 buttons=[["Today", "Tomorrow"], ["Skip"]])
        elif step == "start_date":
            d = parse_date(text)
            if d is None:
                send(chat_id, "Didn't get that date. Try YYYY-MM-DD, today, tomorrow, or Skip.")
                return True
            data["start_date"] = d
            st["step"] = "end_date"
            send(chat_id, "End date? (or Skip)", buttons=[["Skip"]])
        elif step == "end_date":
            d = parse_date(text)
            if d is None:
                send(chat_id, "Didn't get that date. Try YYYY-MM-DD or Skip.")
                return True
            data["end_date"] = d
            st["step"] = "type"
            types = project_types()
            send(chat_id, "Project type?", buttons=chunk(types + ["Skip"], 2) or [["Skip"]])
        elif step == "type":
            if text.strip().lower() != "skip":
                data["project_type"] = text.strip()
            st["step"] = "description"
            send(chat_id, "A short description? (or Skip)", buttons=[["Skip"]])
        elif step == "description":
            if text.strip().lower() != "skip":
                data["description"] = text.strip()
            st["step"] = "confirm"
            send(chat_id,
                 "<b>Confirm new project</b>\n"
                 f"Name: {esc(data.get('title'))}\n"
                 f"Start: {esc(data.get('start_date') or '—')}\n"
                 f"End: {esc(data.get('end_date') or '—')}\n"
                 f"Type: {esc(data.get('project_type') or '—')}\n"
                 f"Desc: {esc(data.get('description') or '—')}",
                 buttons=[["✅ Create", "❌ Cancel"]])
        elif step == "confirm":
            if text.strip().lower().startswith("✅") or text.strip().lower() == "create":
                name = create_project(data)
                STATE.pop(state_key, None)
                send(chat_id, f"✅ Created <b>{esc(data.get('title'))}</b> ({esc(name)}).", remove_kb=True)
            else:
                STATE.pop(state_key, None)
                send(chat_id, "Cancelled.", remove_kb=True)
        return True

    if flow == "task":
        if step == "title":
            data["title"] = text.strip()
            data["_projmap"] = {(p.title or p.name): p.name for p in open_projects()}
            st["step"] = "project"
            send(chat_id, "Which project?", buttons=chunk(list(data["_projmap"].keys()), 2))
        elif step == "project":
            pm = data.get("_projmap", {})
            if text.strip() not in pm:
                send(chat_id, "Pick a project from the buttons.")
                return True
            data["project"] = pm[text.strip()]
            st["step"] = "due_date"
            send(chat_id, "Due date? (YYYY-MM-DD, today, tomorrow, or Skip)",
                 buttons=[["Today", "Tomorrow"], ["Skip"]])
        elif step == "due_date":
            d = parse_date(text)
            if d is None:
                send(chat_id, "Didn't get that date. Try YYYY-MM-DD, today, tomorrow, or Skip.")
                return True
            data["due_date"] = d
            st["step"] = "priority"
            send(chat_id, "Priority?", buttons=[["Low", "Medium"], ["High", "Urgent"]])
        elif step == "priority":
            pr = text.strip().capitalize()
            data["priority"] = pr if pr in ("Low", "Medium", "High", "Urgent") else PRIORITY_DEFAULT
            mem = [m for m in members() if m.user != "agent@hive.local"]
            data["_memmap"] = {(m.member_name or m.name): m.user for m in mem}
            st["step"] = "assignee"
            send(chat_id, "Assign to? (or Skip)",
                 buttons=chunk(list(data["_memmap"].keys()), 2) + [["Skip"]])
        elif step == "assignee":
            mm = data.get("_memmap", {})
            if text.strip() in mm:
                data["assignee_user"] = mm[text.strip()]
            st["step"] = "confirm"
            send(chat_id,
                 "<b>Confirm new task</b>\n"
                 f"Title: {esc(data.get('title'))}\n"
                 f"Project: {esc(_project_label(data))}\n"
                 f"Due: {esc(data.get('due_date') or '—')}\n"
                 f"Priority: {esc(data.get('priority'))}\n"
                 f"Assignee: {esc(data.get('assignee_user') or '—')}",
                 buttons=[["✅ Create", "❌ Cancel"]])
        elif step == "confirm":
            if text.strip().lower().startswith("✅") or text.strip().lower() == "create":
                name = create_task(data)
                STATE.pop(state_key, None)
                send(chat_id, f"✅ Created task <b>{esc(data.get('title'))}</b> ({esc(name)}).", remove_kb=True)
            else:
                STATE.pop(state_key, None)
                send(chat_id, "Cancelled.", remove_kb=True)
        return True

    return False


def _project_label(data):
    for label, name in data.get("_projmap", {}).items():
        if name == data.get("project"):
            return label
    return data.get("project")


def create_project(data) -> str:
    frappe.set_user("Administrator")
    doc = frappe.new_doc("Hive Project")
    doc.title = data["title"]
    if data.get("project_type"):
        doc.project_type = data["project_type"]
    if data.get("description"):
        doc.description = data["description"]
    if data.get("start_date"):
        doc.start_date = data["start_date"]
    if data.get("end_date"):
        doc.end_date = data["end_date"]
    doc.status = "Open"
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


def create_task(data) -> str:
    frappe.set_user("Administrator")
    doc = frappe.new_doc("Hive Task")
    doc.title = data["title"]
    doc.project = data["project"]
    doc.status = "To Do"
    doc.priority = data.get("priority") or PRIORITY_DEFAULT
    if data.get("due_date"):
        doc.due_date = data["due_date"]
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    if data.get("assignee_user"):
        try:
            from frappe.desk.form.assign_to import add as assign_add
            assign_add({"doctype": "Hive Task", "name": doc.name,
                        "assign_to": [data["assignee_user"]], "notify": 0})
            frappe.db.commit()
        except Exception as e:
            print("assign error:", e, flush=True)
    return doc.name


# ---------------------------------------------------------------- dispatch
def handle_update(update):
    global _CTX
    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return
    chat = msg.get("chat", {})
    chat_id = chat.get("id")
    chat_type = chat.get("type")
    frm = msg.get("from") or {}
    user_id = frm.get("id")
    text = (msg.get("text") or "").strip()
    if chat_id is None or user_id is None or not text:
        return

    ensure_db()
    is_group = chat_type in ("group", "supergroup")
    _CTX = {"reply_to": msg.get("message_id") if is_group else None, "selective": is_group}
    state_key = f"{chat_id}:{user_id}"

    # Detect + strip our @mention / command suffix (/cmd@bot)
    mentioned = False
    if BOT_USERNAME:
        tag = "@" + BOT_USERNAME
        if tag.lower() in text.lower():
            mentioned = True
            text = re.sub(re.escape(tag), "", text, flags=re.I).strip()
    is_command = text.startswith("/")
    has_state = state_key in STATE
    reply = msg.get("reply_to_message") or {}
    is_reply_to_bot = (reply.get("from") or {}).get("id") == BOT_ID

    # ---- no owner yet: first /start claims ownership ----
    owner = owner_user_id()
    if owner is None:
        if is_command and text.lower().startswith("/start"):
            bind_owner(user_id)
            if is_group:
                authorize_group(chat_id)
            send(chat_id, "👋 Connected! I'm now locked to this owner.")
            cmd_help(chat_id)
        return

    # ---- access control ----
    if is_group:
        if chat_id not in AUTHORIZED_GROUPS:
            # Only the owner can authorize a new group (by commanding/tagging me).
            if is_owner(user_id) and (is_command or mentioned):
                authorize_group(chat_id)
                send(chat_id, "✅ This group is authorized. Everyone here can use me now — try /help.")
            return
        # Authorized group: only act on command / mention / mid-flow / reply-to-me.
        if not (is_command or mentioned or has_state or is_reply_to_bot):
            return
    else:
        if not is_owner(user_id):
            send(chat_id, "⛔ This bot is private.")
            return

    # ---- mid-conversation input ----
    if has_state and not (is_command and text.lower() != "/cancel"):
        if handle_flow(state_key, chat_id, text):
            return

    # ---- command dispatch ----
    low = text.lower()
    if not text or low.startswith("/start") or low.startswith("/help"):
        cmd_help(chat_id)
    elif low.startswith("/newproject") or low in ("new", "new project"):
        start_project(state_key, chat_id)
    elif low.startswith("/newtask"):
        start_task(state_key, chat_id)
    elif low.startswith("/projects"):
        cmd_projects(chat_id)
    elif low.startswith("/mytasks"):
        cmd_mytasks(chat_id)
    elif low.startswith("/tasks"):
        cmd_tasks(chat_id)
    elif low.startswith("/project"):
        cmd_project_detail(chat_id, text[len("/project"):])
    elif low.startswith("/cancel"):
        STATE.pop(state_key, None)
        send(chat_id, "Nothing to cancel.", remove_kb=True)
    elif mentioned and not is_command:
        cmd_help(chat_id)          # tagged with no command → show the menu
    elif is_command:
        send(chat_id, "Didn't understand that. Try /help.")
    # else: plain text in a group with no active flow → ignore silently


def main():
    global BOT_USERNAME, BOT_ID
    frappe.init(site=SITE, sites_path=SITES_PATH)
    frappe.connect()
    if not _token():
        print("No telegram_bot_token set in Hive Settings — exiting.", flush=True)
        return
    load_groups()
    me = tg("getMe")
    if me and me.get("ok"):
        BOT_USERNAME = me["result"].get("username")
        BOT_ID = me["result"].get("id")
    tg("deleteWebhook", drop_pending_updates=False)
    print(f"Ignition Telegram bot started. bot=@{BOT_USERNAME} owner={owner_user_id()} "
          f"groups={sorted(AUTHORIZED_GROUPS)}", flush=True)
    offset = read_offset()
    while True:
        try:
            # Don't hold a transaction open across the 30s long-poll.
            release_db()
            resp = tg("getUpdates", offset=offset, timeout=30,
                      allowed_updates=["message", "edited_message"])
            if not resp or not resp.get("ok"):
                time.sleep(3)
                continue
            for update in resp["result"]:
                offset = update["update_id"] + 1
                write_offset(offset)
                try:
                    handle_update(update)
                except Exception as e:
                    frappe.db.rollback()
                    print("handle_update error:", repr(e), flush=True)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print("loop error:", repr(e), flush=True)
            time.sleep(5)
            ensure_db()


if __name__ == "__main__":
    main()
