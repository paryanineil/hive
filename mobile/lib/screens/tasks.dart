import 'package:flutter/material.dart';

import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/task_tile.dart';
import 'calendar_view.dart';
import 'task_detail.dart';
import 'timeline_view.dart';

/// Smart lists mirrored from the web sidebar.
const _smartLists = [
  ('all', 'All', Icons.all_inclusive),
  ('my_day', 'My Day', Icons.wb_sunny_outlined),
  ('overdue', 'Overdue', Icons.warning_amber_rounded),
  ('important', 'Important', Icons.star_outline),
  ('planned', 'Planned', Icons.event_outlined),
  ('completed', 'Completed', Icons.check_circle_outline),
];

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => TasksScreenState();
}

class TasksScreenState extends State<TasksScreen> {
  List<Task>? _tasks;
  Map<String, String> _projectTitles = {};
  Map<String, int> _counts = {};
  String? _error;

  String _smart = 'all';
  String _search = '';
  String _view = 'list'; // list | kanban | calendar | timeline
  final Set<String> _statusFilter = {};
  final Set<String> _priorityFilter = {};
  String? _projectFilter;

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    try {
      final results = await Future.wait([
        repo.tasks(),
        repo.projects(),
      ]);
      final tasks = results[0] as List<Task>;
      final projects = results[1] as List<Project>;
      Map<String, int> counts = {};
      try {
        counts = await repo.smartListCounts();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _tasks = tasks;
        _projectTitles = {for (final p in projects) p.name: p.title};
        _counts = counts;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  List<Task> get _visible {
    var list = _tasks ?? [];
    switch (_smart) {
      case 'my_day':
        list = list.where((t) => t.dueState == 'today').toList();
      case 'overdue':
        list = list.where((t) => t.dueState == 'overdue').toList();
      case 'important':
        list = list
            .where((t) => (t.priority == 'High' || t.priority == 'Urgent') && t.status != 'Done')
            .toList();
      case 'planned':
        list = list.where((t) => t.dueDate != null && t.status != 'Done').toList();
      case 'completed':
        list = list.where((t) => t.status == 'Done').toList();
      default:
        // "All" hides completed, like the web default.
        list = list.where((t) => t.status != 'Done').toList();
    }
    if (_statusFilter.isNotEmpty) {
      list = list.where((t) => _statusFilter.contains(t.status)).toList();
    }
    if (_priorityFilter.isNotEmpty) {
      list = list.where((t) => _priorityFilter.contains(t.priority)).toList();
    }
    if (_projectFilter != null) {
      list = list.where((t) => t.project == _projectFilter).toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list
          .where((t) =>
              t.title.toLowerCase().contains(q) ||
              (_projectTitles[t.project] ?? '').toLowerCase().contains(q))
          .toList();
    }
    return list;
  }

  int _smartCount(String key) => switch (key) {
        'all' => _counts['all'] ?? 0,
        _ => _counts[key] ?? 0,
      };

  Future<void> _openTask(Task t) async {
    await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => TaskDetailScreen(taskName: t.name)));
    refresh();
  }

  Future<void> _createTask() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: kCard,
      builder: (_) => CreateTaskSheet(
        projects: _projectTitles,
        initialProject: _projectFilter,
      ),
    );
    if (created == true) refresh();
  }

  @override
  Widget build(BuildContext context) {
    final filterCount = _statusFilter.length +
        _priorityFilter.length +
        (_projectFilter != null ? 1 : 0);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tasks'),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'View',
            icon: Icon(switch (_view) {
              'kanban' => Icons.view_kanban_outlined,
              'calendar' => Icons.calendar_month_outlined,
              'timeline' => Icons.stacked_bar_chart,
              _ => Icons.view_agenda_outlined,
            }),
            color: kCard,
            onSelected: (v) => setState(() => _view = v),
            itemBuilder: (_) => [
              for (final (v, label, icon) in const [
                ('list', 'List', Icons.view_agenda_outlined),
                ('kanban', 'Board', Icons.view_kanban_outlined),
                ('calendar', 'Calendar', Icons.calendar_month_outlined),
                ('timeline', 'Timeline', Icons.stacked_bar_chart),
              ])
                CheckedPopupMenuItem(
                  value: v,
                  checked: _view == v,
                  child: Row(children: [
                    Icon(icon, size: 18, color: kMuted),
                    const SizedBox(width: 8),
                    Text(label),
                  ]),
                ),
            ],
          ),
          IconButton(
            tooltip: 'Filters',
            icon: Badge(
              isLabelVisible: filterCount > 0,
              label: Text('$filterCount'),
              child: const Icon(Icons.tune),
            ),
            onPressed: _openFilters,
          ),
        ],
      ),
      floatingActionButton:
          FloatingActionButton(onPressed: _createTask, child: const Icon(Icons.add)),
      body: _error != null
          ? _ErrorRetry(message: _error!, onRetry: refresh)
          : _tasks == null
              ? const Center(child: CircularProgressIndicator(color: kOrange))
              : RefreshIndicator(
                  color: kOrange,
                  onRefresh: refresh,
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                        child: TextField(
                          onChanged: (v) => setState(() => _search = v),
                          decoration: const InputDecoration(
                            hintText: 'Search tasks...',
                            prefixIcon: Icon(Icons.search, color: kMuted),
                            isDense: true,
                          ),
                        ),
                      ),
                      SizedBox(
                        height: 46,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          children: [
                            for (final (key, label, icon) in _smartLists)
                              Padding(
                                padding: const EdgeInsets.only(right: 6),
                                child: ChoiceChip(
                                  avatar: Icon(icon,
                                      size: 15,
                                      color: key == 'overdue' ? const Color(0xFFEF4444) : kMuted),
                                  label: Text(_smartCount(key) > 0 && key != 'all'
                                      ? '$label ${_smartCount(key)}'
                                      : label),
                                  selected: _smart == key,
                                  onSelected: (_) => setState(() => _smart = key),
                                ),
                              ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: _view == 'kanban'
                            ? KanbanBoard(
                                tasks: _visible,
                                projectTitles: _projectTitles,
                                onOpen: _openTask,
                                onMoved: refresh,
                              )
                            : _view == 'calendar'
                                ? CalendarView(
                                    tasks: _visible,
                                    projectTitles: _projectTitles,
                                    onOpen: _openTask,
                                  )
                                : _view == 'timeline'
                                    ? TimelineView(
                                        tasks: _visible,
                                        projectTitles: _projectTitles,
                                        onOpen: _openTask,
                                      )
                                    : _visible.isEmpty
                                ? const Center(
                                    child:
                                        Text('No tasks here', style: TextStyle(color: kMuted)))
                                : ListView.separated(
                                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 88),
                                    itemCount: _visible.length,
                                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                                    itemBuilder: (_, i) {
                                      final t = _visible[i];
                                      return TaskTile(
                                        task: t,
                                        projectTitle: _projectTitles[t.project] ?? '',
                                        onTap: () => _openTask(t),
                                      );
                                    },
                                  ),
                      ),
                    ],
                  ),
                ),
    );
  }

  Future<void> _openFilters() async {
    await showModalBottomSheet(
      context: context,
      backgroundColor: kCard,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: const EdgeInsets.all(16),
          child: ListView(
            shrinkWrap: true,
            children: [
              const Text('Filters', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              const Text('Status', style: TextStyle(color: kMuted, fontSize: 12)),
              Wrap(
                spacing: 6,
                children: [
                  for (final s in taskStatuses)
                    FilterChip(
                      label: Text(s),
                      selected: _statusFilter.contains(s),
                      onSelected: (v) => setSheet(() {
                        v ? _statusFilter.add(s) : _statusFilter.remove(s);
                        setState(() {});
                      }),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              const Text('Priority', style: TextStyle(color: kMuted, fontSize: 12)),
              Wrap(
                spacing: 6,
                children: [
                  for (final p in taskPriorities)
                    FilterChip(
                      label: Text(p),
                      selected: _priorityFilter.contains(p),
                      onSelected: (v) => setSheet(() {
                        v ? _priorityFilter.add(p) : _priorityFilter.remove(p);
                        setState(() {});
                      }),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              const Text('Project', style: TextStyle(color: kMuted, fontSize: 12)),
              Wrap(
                spacing: 6,
                children: [
                  for (final e in _projectTitles.entries)
                    FilterChip(
                      label: Text(e.value),
                      selected: _projectFilter == e.key,
                      onSelected: (v) => setSheet(() {
                        _projectFilter = v ? e.key : null;
                        setState(() {});
                      }),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () {
                  setSheet(() {
                    _statusFilter.clear();
                    _priorityFilter.clear();
                    _projectFilter = null;
                    setState(() {});
                  });
                },
                child: const Text('Clear all filters'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Kanban: horizontally scrolling status columns, long-press drag to move.
class KanbanBoard extends StatelessWidget {
  const KanbanBoard({
    super.key,
    required this.tasks,
    required this.projectTitles,
    required this.onOpen,
    required this.onMoved,
  });

  final List<Task> tasks;
  final Map<String, String> projectTitles;
  final void Function(Task) onOpen;
  final VoidCallback onMoved;

  @override
  Widget build(BuildContext context) {
    const columns = ['Someday', 'Backlog', 'To Do', 'In Progress', 'Done'];
    return ListView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
      children: [
        for (final status in columns)
          _KanbanColumn(
            status: status,
            tasks: tasks.where((t) => t.status == status).toList(),
            projectTitles: projectTitles,
            onOpen: onOpen,
            onMoved: onMoved,
          ),
      ],
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  const _KanbanColumn({
    required this.status,
    required this.tasks,
    required this.projectTitles,
    required this.onOpen,
    required this.onMoved,
  });

  final String status;
  final List<Task> tasks;
  final Map<String, String> projectTitles;
  final void Function(Task) onOpen;
  final VoidCallback onMoved;

  @override
  Widget build(BuildContext context) {
    return DragTarget<Task>(
      onWillAcceptWithDetails: (d) => d.data.status != status,
      onAcceptWithDetails: (d) async {
        try {
          await repo.updateTask(d.data.name, {'status': status});
        } catch (e) {
          if (context.mounted) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(e.toString())));
          }
        }
        onMoved();
      },
      builder: (context, candidates, _) => Container(
        width: 270,
        margin: const EdgeInsets.only(right: 10),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: candidates.isNotEmpty ? kOrange.withValues(alpha: 0.08) : kCard.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: candidates.isNotEmpty ? kOrange : kBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Row(
                children: [
                  Container(
                    width: 8, height: 8,
                    decoration: BoxDecoration(
                        color: statusColors[status] ?? kMuted, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 6),
                  Text(status.toUpperCase(),
                      style: const TextStyle(
                          fontSize: 11, color: kMuted, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text('${tasks.length}', style: const TextStyle(fontSize: 11, color: kMuted)),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Expanded(
              child: ListView.separated(
                itemCount: tasks.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final t = tasks[i];
                  final tile = TaskTile(
                      task: t, projectTitle: projectTitles[t.project] ?? '', onTap: () => onOpen(t));
                  return LongPressDraggable<Task>(
                    data: t,
                    feedback: SizedBox(
                        width: 250,
                        child: Material(color: Colors.transparent, child: tile)),
                    childWhenDragging: Opacity(opacity: 0.35, child: tile),
                    child: tile,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CreateTaskSheet extends StatefulWidget {
  const CreateTaskSheet({super.key, required this.projects, this.initialProject});
  final Map<String, String> projects;
  final String? initialProject;

  @override
  State<CreateTaskSheet> createState() => _CreateTaskSheetState();
}

class _CreateTaskSheetState extends State<CreateTaskSheet> {
  final _title = TextEditingController();
  String? _project;
  String _priority = 'Medium';
  DateTime? _due;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _project = widget.initialProject ??
        (widget.projects.isNotEmpty ? widget.projects.keys.first : null);
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty || _project == null) return;
    setState(() => _busy = true);
    try {
      await repo.createTask({
        'title': _title.text.trim(),
        'project': _project,
        'status': 'To Do',
        'priority': _priority,
        if (_due != null) 'due_date': _due!.toIso8601String().substring(0, 10),
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          left: 16, right: 16, top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('New task', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          TextField(
            controller: _title,
            autofocus: true,
            decoration: const InputDecoration(hintText: 'What needs doing?'),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _project,
            dropdownColor: kCard,
            items: [
              for (final e in widget.projects.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: (v) => setState(() => _project = v),
            decoration: const InputDecoration(labelText: 'Project'),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _priority,
                  dropdownColor: kCard,
                  items: [
                    for (final p in taskPriorities)
                      DropdownMenuItem(value: p, child: Text(p)),
                  ],
                  onChanged: (v) => setState(() => _priority = v ?? 'Medium'),
                  decoration: const InputDecoration(labelText: 'Priority'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: const BorderSide(color: kBorder)),
                  icon: const Icon(Icons.event, size: 16, color: kMuted),
                  label: Text(
                      _due == null ? 'Due date' : _due!.toIso8601String().substring(0, 10),
                      style: const TextStyle(color: Colors.white)),
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _due ?? DateTime.now(),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2035),
                    );
                    if (picked != null) setState(() => _due = picked);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: Text(_busy ? 'Creating…' : 'Create task'),
          ),
        ],
      ),
    );
  }
}

class _ErrorRetry extends StatelessWidget {
  const _ErrorRetry({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: kMuted, size: 40),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: kMuted)),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
