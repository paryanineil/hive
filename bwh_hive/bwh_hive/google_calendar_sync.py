# Copyright (c) 2026, BWH Studios and contributors
# For license information, please see license.txt

"""Two-way sync between Hive Tasks and Google Calendar.

Rather than talking to Google directly, this bridges Hive Task <-> Frappe's
built-in `Event` doctype. Frappe already owns the Google side (OAuth, push on
Event insert/update/trash, and a scheduled pull), so we only maintain the
mapping:

    Hive Task  --(task_to_event)-->  Event  --(Frappe)-->  Google Calendar
    Hive Task  <--(event_to_task)--  Event  <--(Frappe)--  Google Calendar

All-day dates: Google treats an all-day `end.date` as EXCLUSIVE, and Frappe
stores that same exclusive value in `Event.ends_on`. So a task due on the 10th
is written as ends_on = the 11th, and read back as due_date = ends_on - 1 day.
Keeping both directions symmetric is what stops the range drifting a day on
every sync.

Enable via Hive Settings: `google_calendar_sync_enabled` + `google_calendar`.
"""

import frappe
from frappe.utils import add_days, getdate

# Set while we are writing one side from the other, so the counterpart hook
# doesn't bounce the change straight back (Task -> Event -> Task -> ...).
SYNC_FLAG = "hive_gcal_syncing"


def _settings():
	return frappe.get_cached_doc("Hive Settings")


def _sync_target() -> str | None:
	"""Return the configured Google Calendar name, or None when sync is off."""
	try:
		settings = _settings()
	except Exception:
		return None
	if not settings.get("google_calendar_sync_enabled"):
		return None
	calendar = settings.get("google_calendar")
	if not calendar or not frappe.db.exists("Google Calendar", calendar):
		return None
	return calendar


def _calendar_ready(calendar: str) -> bool:
	"""True only when the calendar can actually reach Google.

	Frappe's `insert_event_in_google_calendar` fetches an access token *before*
	it checks `push_to_google_calendar`, so flagging an Event for Google sync
	against an unauthorized calendar raises on every save. Gate on the refresh
	token so enabling sync before finishing OAuth degrades to a local-only
	mirror instead of breaking task saves.
	"""
	try:
		account = frappe.get_cached_doc("Google Calendar", calendar)
	except Exception:
		return False
	if not account.enable or not account.push_to_google_calendar:
		return False
	return bool(account.get_password("refresh_token", raise_exception=False))


def _task_dates(task) -> tuple[str, str] | None:
	"""Resolve a task's [start, due] range. Either date alone yields a single day."""
	start = task.get("start_date")
	due = task.get("due_date")
	if not start and not due:
		return None
	s = getdate(start or due)
	e = getdate(due or start)
	if s > e:
		s, e = e, s
	return s, e


def _event_name_for(task_name: str) -> str | None:
	name = frappe.db.get_value("Hive Task", task_name, "calendar_event")
	if name and frappe.db.exists("Event", name):
		return name
	return None


# ---------------------------------------------------------------- Task -> Event
def task_to_event(doc, method=None):
	"""Create/update/remove the Event mirroring this task."""
	if frappe.flags.get(SYNC_FLAG):
		return
	calendar = _sync_target()
	if not calendar:
		return

	dates = _task_dates(doc)
	# Archived or undated tasks shouldn't occupy the calendar.
	if doc.get("is_archived") or not dates:
		remove_event(doc)
		return

	start, end = dates
	values = {
		"subject": doc.title,
		"starts_on": f"{start} 00:00:00",
		# Google's all-day end is exclusive; +1 day makes the due date inclusive.
		"ends_on": f"{add_days(end, 1)} 00:00:00",
		"all_day": 1,
		"status": "Completed" if doc.get("status") == "Done" else "Open",
		# Only flag for Google once the calendar is authorized (see _calendar_ready).
		"sync_with_google_calendar": 1 if _calendar_ready(calendar) else 0,
		"google_calendar": calendar,
	}

	frappe.flags[SYNC_FLAG] = True
	try:
		existing = _event_name_for(doc.name)
		if existing:
			event = frappe.get_doc("Event", existing)
			changed = any(str(event.get(k)) != str(v) for k, v in values.items())
			if not changed:
				return
			event.update(values)
			event.save(ignore_permissions=True)
		else:
			event = frappe.get_doc({
				"doctype": "Event",
				"event_type": "Private",
				"hive_task": doc.name,
				**values,
			})
			event.insert(ignore_permissions=True)
			# db_set avoids re-triggering the Hive Task hooks.
			frappe.db.set_value("Hive Task", doc.name, "calendar_event", event.name,
					update_modified=False)
	except Exception:
		frappe.log_error(title="Hive: task -> Google Calendar sync failed",
				message=frappe.get_traceback())
	finally:
		frappe.flags[SYNC_FLAG] = False


def remove_event(doc, method=None):
	"""Delete the mirrored Event (task archived, undated, or deleted)."""
	name = _event_name_for(doc.name)
	if not name:
		return
	frappe.flags[SYNC_FLAG] = True
	try:
		# Clear the link first: Frappe's link-integrity check refuses to delete a
		# document that is still referenced (here by Hive Task.calendar_event).
		frappe.db.set_value("Hive Task", doc.name, "calendar_event", None, update_modified=False)
		# Deleting the Event fires Frappe's on_trash hook, which removes it from Google.
		frappe.delete_doc("Event", name, ignore_permissions=True, delete_permanently=True)
	except Exception:
		frappe.log_error(title="Hive: removing Google Calendar event failed",
				message=frappe.get_traceback())
	finally:
		frappe.flags[SYNC_FLAG] = False


# ---------------------------------------------------------------- Event -> Task
def event_to_task(doc, method=None):
	"""Push date/title edits made in Google (pulled into the Event) back to the task."""
	if frappe.flags.get(SYNC_FLAG):
		return
	task_name = doc.get("hive_task")
	if not task_name or not frappe.db.exists("Hive Task", task_name):
		return
	if not doc.get("starts_on"):
		return

	start = getdate(doc.starts_on)
	if doc.get("ends_on"):
		end = getdate(doc.ends_on)
		# Undo the exclusive-end offset for all-day events.
		if doc.get("all_day"):
			end = add_days(end, -1)
		if getdate(end) < start:
			end = start
	else:
		end = start

	updates = {"start_date": start, "due_date": getdate(end)}
	if doc.get("subject"):
		updates["title"] = doc.subject

	current = frappe.db.get_value("Hive Task", task_name,
			["start_date", "due_date", "title"], as_dict=True)
	if current and all(str(current.get(k)) == str(v) for k, v in updates.items()):
		return

	frappe.flags[SYNC_FLAG] = True
	try:
		task = frappe.get_doc("Hive Task", task_name)
		task.update(updates)
		task.save(ignore_permissions=True)
	except Exception:
		frappe.log_error(title="Hive: Google Calendar -> task sync failed",
				message=frappe.get_traceback())
	finally:
		frappe.flags[SYNC_FLAG] = False


# ---------------------------------------------------------------- bulk / manual
@frappe.whitelist()
def sync_all_tasks():
	"""Backfill: push every dated, unarchived task to the calendar. Returns a count."""
	frappe.only_for("System Manager")
	if not _sync_target():
		frappe.throw("Google Calendar sync is not configured in Hive Settings.")

	names = frappe.get_all(
		"Hive Task",
		filters={"is_archived": 0},
		or_filters=[["start_date", "is", "set"], ["due_date", "is", "set"]],
		pluck="name",
	)
	for name in names:
		task_to_event(frappe.get_doc("Hive Task", name))
	frappe.db.commit()
	return len(names)
