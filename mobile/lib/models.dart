// Plain data models for the Hive doctypes the app uses.

class Task {
  Task(this.raw);
  final Map<String, dynamic> raw;

  String get name => raw['name'] as String;
  String get title => (raw['title'] as String?) ?? '';
  String get status => (raw['status'] as String?) ?? 'To Do';
  String get priority => (raw['priority'] as String?) ?? 'Medium';
  String get project => (raw['project'] as String?) ?? '';
  String? get dueDate => raw['due_date'] as String?;
  String? get startDate => raw['start_date'] as String?;
  String? get description => raw['description'] as String?;
  String get owner => (raw['owner'] as String?) ?? '';
  String? get creation => raw['creation'] as String?;
  String? get milestone => raw['milestone'] as String?;

  List<ChecklistItem> get checklist =>
      ((raw['checklist'] as List?) ?? const []).map((e) => ChecklistItem(Map.from(e as Map))).toList();

  /// none | overdue | today | upcoming — same day-based rule as the web app.
  String get dueState {
    final due = dueDate;
    if (due == null || status == 'Done' || status == 'Someday') return 'none';
    final now = DateTime.now();
    final today =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final d = due.substring(0, 10);
    if (d.compareTo(today) < 0) return 'overdue';
    if (d == today) return 'today';
    return 'upcoming';
  }
}

class ChecklistItem {
  ChecklistItem(this.raw);
  final Map<String, dynamic> raw;
  String get content => (raw['content'] as String?) ?? '';
  bool get completed => (raw['completed'] as num? ?? 0) == 1;
  set completed(bool v) => raw['completed'] = v ? 1 : 0;
}

class Project {
  Project(this.raw);
  final Map<String, dynamic> raw;
  String get name => raw['name'] as String;
  String get title => (raw['title'] as String?) ?? name;
  String get status => (raw['status'] as String?) ?? 'Open';
  String? get type => raw['project_type'] as String?;
  bool get isPrivate => (raw['is_private'] as num? ?? 0) == 1;
  String get owner => (raw['owner'] as String?) ?? '';
}

class Member {
  Member(this.raw);
  final Map<String, dynamic> raw;
  String get name => raw['name'] as String;
  String get displayName => (raw['member_name'] as String?) ?? name;
}

class Note {
  Note(this.raw);
  final Map<String, dynamic> raw;
  String get name => raw['name'] as String;
  String get title => (raw['title'] as String?) ?? 'Untitled';
  bool get isFolder => (raw['is_folder'] as num? ?? 0) == 1;
  String? get parent => raw['parent_note'] as String?;
  String? get content => raw['content'] as String?;
}

class ChecklistTemplate {
  ChecklistTemplate(this.name, this.templateName, this.items);
  final String name;
  final String templateName;
  final List<String> items;
}

class Comment {
  Comment(this.raw);
  final Map<String, dynamic> raw;
  String get content => (raw['content'] as String?) ?? '';
  String get postedBy => (raw['posted_by'] as String?) ?? '';
  String? get creation => raw['creation'] as String?;
}

class Attachment {
  Attachment(this.raw);
  final Map<String, dynamic> raw;
  String get name => raw['name'] as String;
  String get fileName => (raw['file_name'] as String?) ?? name;
  String get fileUrl => (raw['file_url'] as String?) ?? '';
  int get size => (raw['file_size'] as num? ?? 0).toInt();
}

class Assignee {
  Assignee(this.raw);
  final Map<String, dynamic> raw;
  String get member => (raw['member'] as String?) ?? '';
  String get displayName => (raw['member_name'] as String?) ?? member;
}
