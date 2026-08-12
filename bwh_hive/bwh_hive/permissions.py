import frappe


def _get_client_projects() -> list[str]:
	"""Get project names where the current client user is a project member."""
	member = frappe.db.get_value("Hive Member", frappe.session.user, "client")
	if not member:
		return []

	return frappe.get_all(
		"Hive Project",
		filters={"client": member},
		pluck="name",
	)


def _is_hive_client() -> bool:
	return "Hive Client" in frappe.get_roles(frappe.session.user) and "Hive Team" not in frappe.get_roles(
		frappe.session.user
	)


def _shared_with_user_subquery(user_escaped: str) -> str:
	"""Projects the user has been added to via the project's Members table.

	Being listed as a member is what shares a private project — otherwise
	"private" would mean owner-only and there'd be no way to collaborate on one.
	`Hive Member.name` is the user id, so the child row's `member` compares
	directly against the session user.
	"""
	return (
		f"SELECT `parent` FROM `tabHive Project Member` "
		f"WHERE `parenttype` = 'Hive Project' AND `member` = {user_escaped}"
	)


def _private_project_condition(table: str, user: str) -> str:
	"""Return SQL condition that hides private projects the user isn't part of."""
	user_escaped = frappe.db.escape(user)
	return (
		f"(`{table}`.`is_private` = 0 "
		f"OR `{table}`.`owner` = {user_escaped} "
		f"OR `{table}`.`name` IN ({_shared_with_user_subquery(user_escaped)}))"
	)


def project_query(user: str | None) -> str:
	if not user:
		user = frappe.session.user

	if user == "Administrator":
		return ""

	if not _is_hive_client():
		# Team members: hide other users' private projects
		return _private_project_condition("tabHive Project", user)

	projects = _get_client_projects()
	if not projects:
		return "1=0"

	project_list = ", ".join(frappe.db.escape(p) for p in projects)
	return f"`tabHive Project`.`name` IN ({project_list})"


def _private_task_condition(user: str) -> str:
	"""Return SQL condition that hides tasks in private projects the user isn't part of."""
	user_escaped = frappe.db.escape(user)
	return (
		f"`tabHive Task`.`project` NOT IN "
		f"(SELECT `name` FROM `tabHive Project` WHERE `is_private` = 1 "
		f"AND `owner` != {user_escaped} "
		f"AND `name` NOT IN ({_shared_with_user_subquery(user_escaped)}))"
	)


def task_query(user: str | None) -> str:
	if not user:
		user = frappe.session.user

	if user == "Administrator":
		return ""

	if not _is_hive_client():
		# Team members: hide tasks from other users' private projects
		return _private_task_condition(user)

	projects = _get_client_projects()
	if not projects:
		return "1=0"

	project_list = ", ".join(frappe.db.escape(p) for p in projects)
	return f"`tabHive Task`.`project` IN ({project_list}) AND `tabHive Task`.`is_internal` = 0"


def _private_project_subquery_condition(table: str, project_field: str, user: str) -> str:
	"""Return SQL condition for child tables that reference a project."""
	user_escaped = frappe.db.escape(user)
	return (
		f"`{table}`.`{project_field}` NOT IN "
		f"(SELECT `name` FROM `tabHive Project` WHERE `is_private` = 1 "
		f"AND `owner` != {user_escaped} "
		f"AND `name` NOT IN ({_shared_with_user_subquery(user_escaped)}))"
	)


def feature_request_query(user: str | None) -> str:
	if not user:
		user = frappe.session.user

	if user == "Administrator":
		return ""

	if not _is_hive_client():
		return _private_project_subquery_condition("tabHive Feature Request", "project", user)

	projects = _get_client_projects()
	if not projects:
		return "1=0"

	project_list = ", ".join(frappe.db.escape(p) for p in projects)
	return f"`tabHive Feature Request`.`project` IN ({project_list})"


def project_update_query(user: str | None) -> str:
	if not user:
		user = frappe.session.user

	if user == "Administrator":
		return ""

	if not _is_hive_client():
		return _private_project_subquery_condition("tabHive Project Update", "project", user)

	projects = _get_client_projects()
	if not projects:
		return "1=0"

	project_list = ", ".join(frappe.db.escape(p) for p in projects)
	return f"`tabHive Project Update`.`project` IN ({project_list})"


def milestone_query(user: str | None) -> str:
	if not user:
		user = frappe.session.user

	if user == "Administrator":
		return ""

	if not _is_hive_client():
		return _private_project_subquery_condition("tabHive Milestone", "project", user)

	projects = _get_client_projects()
	if not projects:
		return "1=0"

	project_list = ", ".join(frappe.db.escape(p) for p in projects)
	return f"`tabHive Milestone`.`project` IN ({project_list})"


def member_query(user: str | None) -> str:
	"""Client users can only see members who share the same client."""
	if not user:
		user = frappe.session.user

	if user == "Administrator" or not _is_hive_client():
		return ""

	client = frappe.db.get_value("Hive Member", user, "client")
	if not client:
		# No client assigned — can only see themselves
		return f"`tabHive Member`.`name` = {frappe.db.escape(user)}"

	return f"`tabHive Member`.`client` = {frappe.db.escape(client)}"


def project_has_permission(doc, ptype: str | None = None, user: str | None = None) -> bool:
	"""Block access to private projects for non-owners and restrict client access."""
	if not user:
		user = frappe.session.user

	# Private projects: the owner, plus anyone added to the Members table.
	if doc.is_private and doc.owner != user:
		shared_with = {m.member for m in (doc.get("members") or [])}
		if user not in shared_with:
			return False

	# Client users: can only access projects linked to their client org
	roles = frappe.get_roles(user)
	if "Hive Client" in roles and "Hive Team" not in roles:
		client = frappe.db.get_value("Hive Member", user, "client")
		if not client or doc.client != client:
			return False

	return True


def client_query(user: str | None) -> str:
	"""Client users cannot see any Hive Client records."""
	if not user:
		user = frappe.session.user

	if user == "Administrator" or not _is_hive_client():
		return ""

	return "1=0"
