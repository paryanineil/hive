# Copyright (c) 2026, BWH Studios and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class HiveNote(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		content: DF.TextEditor | None
		icon: DF.Data | None
		is_archived: DF.Check
		is_folder: DF.Check
		parent_note: DF.Link | None
		title: DF.Data
	# end: auto-generated types

	def validate(self):
		self._validate_parent()

	def _validate_parent(self):
		"""Reject a parent that would create a cycle (A inside B inside A)."""
		if not self.parent_note:
			return
		if self.parent_note == self.name:
			frappe.throw("A note cannot be inside itself")

		seen = {self.name}
		ancestor = self.parent_note
		while ancestor:
			if ancestor in seen:
				frappe.throw("That would create a loop in the folder structure")
			seen.add(ancestor)
			ancestor = frappe.db.get_value("Hive Note", ancestor, "parent_note")

	def on_trash(self):
		"""Re-home children instead of leaving them orphaned and unreachable."""
		for child in frappe.get_all("Hive Note", filters={"parent_note": self.name}, pluck="name"):
			frappe.db.set_value("Hive Note", child, "parent_note", self.parent_note)
