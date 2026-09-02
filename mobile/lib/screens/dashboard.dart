import 'package:flutter/material.dart';

import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/task_tile.dart';
import 'task_detail.dart';

/// Home tab: a glanceable summary computed from one tasks fetch —
/// due today / overdue, status breakdown, per-project load, and the
/// completions of the last 7 days.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Task>? _tasks;
  Map<String, String> _projectTitles = {};
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([repo.tasks(), repo.projects()]);
      final tasks = results[0] as List<Task>;
      final projects = results[1] as List<Project>;
      if (!mounted) return;
      setState(() {
        _tasks = tasks;
        _projectTitles = {for (final p in projects) p.name: p.title};
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  static String _dayKey(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final tasks = _tasks;
    return Scaffold(
      appBar: AppBar(title: const Text('Ignition')),
      body: _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_error!, style: const TextStyle(color: kMuted)),
              ),
            )
          : tasks == null
              ? const Center(child: CircularProgressIndicator(color: kOrange))
              : RefreshIndicator(
                  color: kOrange,
                  onRefresh: _load,
                  child: _buildBody(tasks),
                ),
    );
  }

  Widget _buildBody(List<Task> tasks) {
    final open = tasks.where((t) => t.status != 'Done').toList();
    final dueToday = open.where((t) => t.dueState == 'today').toList();
    final overdue = open.where((t) => t.dueState == 'overdue').toList();
    final now = DateTime.now();
    final weekAhead = _dayKey(now.add(const Duration(days: 7)));
    final upcoming = open
        .where((t) =>
            t.dueState == 'upcoming' && t.dueDate!.substring(0, 10).compareTo(weekAhead) <= 0)
        .toList();

    // Completions per day, last 7 days (today last).
    final days = [for (var i = 6; i >= 0; i--) now.subtract(Duration(days: i))];
    final doneByDay = {for (final d in days) _dayKey(d): 0};
    var doneThisWeek = 0;
    for (final t in tasks) {
      if (t.status != 'Done') continue;
      final key = (t.completedOn ?? t.creation)?.substring(0, 10);
      if (key != null && doneByDay.containsKey(key)) {
        doneByDay[key] = doneByDay[key]! + 1;
        doneThisWeek++;
      }
    }

    // Open tasks per project, busiest first.
    final byProject = <String, int>{};
    for (final t in open) {
      if (t.project.isEmpty) continue;
      byProject[t.project] = (byProject[t.project] ?? 0) + 1;
    }
    final projectRows = byProject.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final maxProjectCount =
        projectRows.isEmpty ? 1 : projectRows.map((e) => e.value).reduce((a, b) => a > b ? a : b);

    // Status breakdown of open tasks.
    final byStatus = <String, int>{};
    for (final t in open) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 12),
          child: Text('${_greeting()} — ${open.length} open task${open.length == 1 ? '' : 's'}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        ),

        // Stat tiles.
        Row(children: [
          _stat('Due today', dueToday.length, kOrange),
          const SizedBox(width: 8),
          _stat('Overdue', overdue.length, const Color(0xFFB91C1C)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          _stat('Next 7 days', upcoming.length, const Color(0xFF3B82F6)),
          const SizedBox(width: 8),
          _stat('Done this week', doneThisWeek, const Color(0xFF22C55E)),
        ]),

        if (overdue.isNotEmpty) _section('Overdue', overdue, const Color(0xFFB91C1C)),
        if (dueToday.isNotEmpty) _section('Due today', dueToday, kOrange),

        if (byStatus.isNotEmpty) ...[
          _heading('Open tasks by status'),
          _statusBar(byStatus, open.length),
        ],

        if (projectRows.isNotEmpty) ...[
          _heading('Projects'),
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Column(children: [
                for (final e in projectRows.take(6))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(children: [
                      Expanded(
                        flex: 2,
                        child: Text(_projectTitles[e.key] ?? e.key,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13)),
                      ),
                      Expanded(
                        flex: 3,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(3),
                          child: LinearProgressIndicator(
                            value: e.value / maxProjectCount,
                            minHeight: 6,
                            backgroundColor: kBorder,
                            color: kOrange,
                          ),
                        ),
                      ),
                      SizedBox(
                        width: 32,
                        child: Text('${e.value}',
                            textAlign: TextAlign.right,
                            style: const TextStyle(fontSize: 13, color: kMuted)),
                      ),
                    ]),
                  ),
              ]),
            ),
          ),
        ],

        _heading('Completed — last 7 days'),
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: _weekChart(days, doneByDay),
          ),
        ),
      ],
    );
  }

  Widget _heading(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
        child: Text(text,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: kMuted)),
      );

  Widget _stat(String label, int value, Color color) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$value',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: color)),
              const SizedBox(height: 2),
              Text(label, style: const TextStyle(fontSize: 12, color: kMuted)),
            ]),
          ),
        ),
      );

  Widget _section(String title, List<Task> items, Color color) {
    const cap = 5;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _heading('$title (${items.length})'),
      for (final t in items.take(cap))
        TaskTile(
          task: t,
          projectTitle: _projectTitles[t.project] ?? t.project,
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => TaskDetailScreen(taskName: t.name)))
              .then((_) => _load()),
        ),
      if (items.length > cap)
        Padding(
          padding: const EdgeInsets.only(left: 4, top: 2),
          child: Text('+${items.length - cap} more in Tasks',
              style: const TextStyle(fontSize: 12, color: kMuted)),
        ),
    ]);
  }

  Widget _statusBar(Map<String, int> byStatus, int total) {
    final order = ['Blocked', 'In Progress', 'To Do', 'Backlog', 'Someday'];
    final present = order.where(byStatus.containsKey).toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              height: 10,
              child: Row(children: [
                for (final s in present)
                  Expanded(
                    flex: byStatus[s]!,
                    child: Container(color: statusColors[s] ?? kMuted),
                  ),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 12, runSpacing: 4, children: [
            for (final s in present)
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration:
                      BoxDecoration(color: statusColors[s], borderRadius: BorderRadius.circular(2)),
                ),
                const SizedBox(width: 4),
                Text('$s ${byStatus[s]}', style: const TextStyle(fontSize: 12, color: kMuted)),
              ]),
          ]),
        ]),
      ),
    );
  }

  Widget _weekChart(List<DateTime> days, Map<String, int> doneByDay) {
    final maxV = doneByDay.values.fold(0, (a, b) => a > b ? a : b);
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return SizedBox(
      height: 96,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final d in days)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                  Text('${doneByDay[_dayKey(d)]}',
                      style: const TextStyle(fontSize: 11, color: kMuted)),
                  const SizedBox(height: 2),
                  Container(
                    height: maxV == 0 ? 3 : 3 + 52.0 * doneByDay[_dayKey(d)]! / maxV,
                    decoration: BoxDecoration(
                      color: doneByDay[_dayKey(d)]! > 0 ? const Color(0xFF22C55E) : kBorder,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(weekdays[d.weekday - 1],
                      style: const TextStyle(fontSize: 10, color: kMuted)),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}
