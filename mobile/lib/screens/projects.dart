import 'package:flutter/material.dart';

import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/task_tile.dart';
import 'calendar_view.dart';
import 'task_detail.dart';
import 'tasks.dart' show CreateTaskSheet, KanbanBoard;
import 'timeline_view.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  List<Project>? _projects;
  Map<String, int> _openCounts = {};
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final projects = await repo.projects();
      final tasks = await repo.tasks();
      final counts = <String, int>{};
      for (final t in tasks) {
        if (t.status != 'Done') counts[t.project] = (counts[t.project] ?? 0) + 1;
      }
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _openCounts = counts;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Projects')),
      body: _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: kMuted)))
          : _projects == null
              ? const Center(child: CircularProgressIndicator(color: kOrange))
              : RefreshIndicator(
                  color: kOrange,
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _projects!.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final p = _projects![i];
                      return Card(
                        child: ListTile(
                          title: Row(children: [
                            Flexible(
                                child: Text(p.title,
                                    style: const TextStyle(fontWeight: FontWeight.w600))),
                            if (p.isPrivate) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.lock_outline, size: 14, color: kMuted),
                            ],
                          ]),
                          subtitle: Text(
                            [p.status, if (p.type != null) p.type].join(' · '),
                            style: const TextStyle(color: kMuted, fontSize: 12),
                          ),
                          trailing: Text('${_openCounts[p.name] ?? 0} open',
                              style: const TextStyle(color: kMuted, fontSize: 12)),
                          onTap: () async {
                            await Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) => ProjectDetailScreen(project: p)));
                            _load();
                          },
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

class ProjectDetailScreen extends StatefulWidget {
  const ProjectDetailScreen({super.key, required this.project});
  final Project project;

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  List<Task>? _tasks;
  String _view = 'kanban';
  bool _showCompleted = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final tasks = await repo.tasks(filters: [
        ['project', '=', widget.project.name],
      ]);
      if (!mounted) return;
      setState(() {
        _tasks = tasks;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final visible = (_tasks ?? [])
        .where((t) => _showCompleted || t.status != 'Done')
        .toList();
    final done = (_tasks ?? []).where((t) => t.status == 'Done').length;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.project.title),
        actions: [
          IconButton(
            tooltip: _showCompleted ? 'Hide completed' : 'Show completed ($done)',
            icon: Icon(_showCompleted ? Icons.visibility_off : Icons.check_circle_outline),
            onPressed: () => setState(() => _showCompleted = !_showCompleted),
          ),
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
        ],
      ),
      floatingActionButton: FloatingActionButton(
        child: const Icon(Icons.add),
        onPressed: () async {
          final created = await showModalBottomSheet<bool>(
            context: context,
            isScrollControlled: true,
            backgroundColor: kCard,
            builder: (_) => CreateTaskSheet(
              projects: {widget.project.name: widget.project.title},
              initialProject: widget.project.name,
            ),
          );
          if (created == true) _load();
        },
      ),
      body: _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: kMuted)))
          : _tasks == null
              ? const Center(child: CircularProgressIndicator(color: kOrange))
              : _view == 'kanban'
                  ? KanbanBoard(
                      tasks: visible,
                      projectTitles: {widget.project.name: widget.project.title},
                      onOpen: (t) async {
                        await Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => TaskDetailScreen(taskName: t.name)));
                        _load();
                      },
                      onMoved: _load,
                    )
                  : _view == 'calendar'
                      ? CalendarView(
                          tasks: visible,
                          projectTitles: {widget.project.name: widget.project.title},
                          onOpen: (t) async {
                            await Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) => TaskDetailScreen(taskName: t.name)));
                            _load();
                          },
                        )
                      : _view == 'timeline'
                          ? TimelineView(
                              tasks: visible,
                              projectTitles: {widget.project.name: widget.project.title},
                              onOpen: (t) async {
                                await Navigator.of(context).push(MaterialPageRoute(
                                    builder: (_) =>
                                        TaskDetailScreen(taskName: t.name)));
                                _load();
                              },
                            )
                          : RefreshIndicator(
                      color: kOrange,
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 88),
                        itemCount: visible.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => TaskTile(
                          task: visible[i],
                          projectTitle: '',
                          onTap: () async {
                            await Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) =>
                                    TaskDetailScreen(taskName: visible[i].name)));
                            _load();
                          },
                        ),
                      ),
                    ),
    );
  }
}
