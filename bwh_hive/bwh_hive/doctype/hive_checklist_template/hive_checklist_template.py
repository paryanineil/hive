# Copyright (c) 2026, BWH Studios and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class HiveChecklistTemplate(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from bwh_hive.bwh_hive.doctype.hive_task_checklist_item.hive_task_checklist_item import HiveTaskChecklistItem
		from frappe.types import DF

		items: DF.Table[HiveTaskChecklistItem]
		template_name: DF.Data
	# end: auto-generated types

	pass
