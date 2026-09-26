# Copyright (c) 2026, BWH Studios and contributors
# For license information, please see license.txt

"""The one definition of "overdue" for Hive Tasks, shared by every endpoint.

A task is overdue when it is not Done/Someday and either its due date is
before today, or it is due today with a due time that has already passed.
Tasks without a due time stay "due today" for the whole day. The frontend
mirrors this in lib/dueDate.ts; keep the two in step.
"""

import datetime

from frappe.utils import getdate, now_datetime

CLOSED_STATES = ("Done", "Someday")


def time_to_seconds(value) -> int | None:
	"""Seconds since midnight for a Time value in any shape Frappe hands back.

	MariaDB returns TIME columns as `timedelta` from raw queries, documents may
	hold `datetime.time`, and REST payloads carry strings like "9:00:00" or
	"18:30:00.000000".
	"""
	if value in (None, ""):
		return None
	if isinstance(value, datetime.timedelta):
		return int(value.total_seconds()) % 86400
	if isinstance(value, datetime.time):
		return value.hour * 3600 + value.minute * 60 + value.second
	parts = str(value).split(".")[0].split(":")
	try:
		h = int(parts[0])
		m = int(parts[1]) if len(parts) > 1 else 0
		s = int(parts[2]) if len(parts) > 2 else 0
	except ValueError:
		return None
	return h * 3600 + m * 60 + s


def now_parts() -> tuple[datetime.date, int]:
	"""(today, seconds since midnight) in the site's time zone."""
	now = now_datetime()
	return now.date(), now.hour * 3600 + now.minute * 60 + now.second


def is_overdue(due_date, due_time=None, status=None, now: tuple[datetime.date, int] | None = None) -> bool:
	if not due_date or status in CLOSED_STATES:
		return False
	today, now_secs = now or now_parts()
	due = getdate(due_date)
	if due < today:
		return True
	if due > today:
		return False
	secs = time_to_seconds(due_time)
	return secs is not None and secs < now_secs
