import 'client.dart';
import '../models.dart';

const taskFields = [
  'name', 'title', 'project', 'status', 'priority', 'size', 'milestone',
  'due_date', 'start_date', 'owner', 'creation', 'modified', 'description',
];

/// Typed calls over [ApiClient] for everything the app shows.
class Repo {
  Repo(this.api);
  final ApiClient api;

  // ------------------------------------------------------------------ tasks
  Future<List<Task>> tasks({List<List<Object?>>? filters}) async {
    final rows = await api.getList('Hive Task',
        fields: taskFields,
        filters: [
          ['is_archived', '=', 0],
          ...?filters,
        ],
        orderBy: 'due_date asc',
        limit: 500);
    return rows.map(Task.new).toList();
  }

  Future<Task> task(String name) async => Task(await api.getDoc('Hive Task', name));

  Future<void> updateTask(String name, Map<String, Object?> values) =>
      api.updateDoc('Hive Task', name, values);

  Future<Task> createTask(Map<String, Object?> values) async =>
      Task(await api.createDoc('Hive Task', values));

  Future<Map<String, List<Map<String, dynamic>>>> taskAssignees() async {
    final msg = await api.call('bwh_hive.bwh_hive.api.get_task_assignees', post: true);
    return (msg as Map).map((k, v) =>
        MapEntry(k as String, (v as List).cast<Map<String, dynamic>>()));
  }

  Future<Map<String, int>> smartListCounts() async {
    final msg = await api.call('bwh_hive.bwh_hive.api.get_smart_list_counts');
    return (msg as Map).map((k, v) => MapEntry(k as String, (v as num).toInt()));
  }

  // --------------------------------------------------------------- projects
  Future<List<Project>> projects() async {
    final rows = await api.getList('Hive Project',
        fields: ['name', 'title', 'status', 'project_type', 'is_private', 'owner'],
        filters: [
          ['is_archived', '=', 0],
        ],
        orderBy: 'title asc');
    return rows.map(Project.new).toList();
  }

  Future<Project> createProject(Map<String, Object?> values) async =>
      Project(await api.createDoc('Hive Project', values));

  // ---------------------------------------------------------------- members
  Future<List<Member>> members() async {
    final rows = await api.getList('Hive Member',
        fields: ['name', 'member_name'],
        filters: [
          ['is_active', '=', 1],
        ]);
    return rows.map(Member.new).toList();
  }

  // -------------------------------------------------------------- templates
  Future<List<ChecklistTemplate>> checklistTemplates() async {
    final msg = await api.call('bwh_hive.bwh_hive.api.get_checklist_templates');
    return (msg as List)
        .map((e) => ChecklistTemplate(
              e['name'] as String,
              e['template_name'] as String,
              (e['items'] as List).cast<String>(),
            ))
        .toList();
  }

  // ---------------------------------------------------------------- comments
  Future<List<Comment>> comments(String task) async {
    final rows = await api.getList('Hive Task Comment',
        fields: ['name', 'content', 'posted_by', 'creation'],
        filters: [
          ['task', '=', task],
          ['is_archived', '=', 0],
        ],
        orderBy: 'creation asc');
    return rows.map(Comment.new).toList();
  }

  Future<void> addComment(String task, String content) =>
      api.createDoc('Hive Task Comment', {'task': task, 'content': content});

  // ------------------------------------------------------------------ notes
  Future<List<Note>> notes() async {
    final rows = await api.getList('Hive Note',
        fields: ['name', 'title', 'is_folder', 'parent_note', 'modified'],
        filters: [
          ['is_archived', '=', 0],
        ],
        orderBy: 'title asc',
        limit: 1000);
    return rows.map(Note.new).toList();
  }

  Future<Note> note(String name) async => Note(await api.getDoc('Hive Note', name));

  Future<void> updateNote(String name, Map<String, Object?> values) =>
      api.updateDoc('Hive Note', name, values);

  Future<Note> createNote(Map<String, Object?> values) async =>
      Note(await api.createDoc('Hive Note', values));
}
