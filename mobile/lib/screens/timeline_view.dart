import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models.dart';
import '../theme.dart';
import '../widgets/task_tile.dart';

const _colW = 38.0;
const _rowH = 40.0;
const _labelW = 130.0;

/// Gantt-style timeline: a horizontally scrolling day axis with one bar per
/// dated task spanning start -> due, grouped by project. Mirrors the web view;
/// the label column scrolls with the chart (no sticky pane on a phone).
class TimelineView extends StatefulWidget {
  const TimelineView({
    super.key,
    required this.tasks,
    required this.projectTitles,
    required this.onOpen,
  });

  final List<Task> tasks;
  final Map<String, String> projectTitles;
  final void Function(Task) onOpen;

  @override
  State<TimelineView> createState() => _TimelineViewState();
}

class _TimelineViewState extends State<TimelineView> {
  final _hScroll = ScrollController();
  bool _jumped = false;

  DateTime _parse(String iso) {
    final d = DateTime.parse(iso.substring(0, 10));
    return DateTime(d.year, d.month, d.day);
  }

  @override
  Widget build(BuildContext context) {
    final scheduled = <(Task, DateTime, DateTime)>[];
    final unscheduled = <Task>[];
    for (final t in widget.tasks) {
      final s = t.startDate != null ? _parse(t.startDate!) : null;
      final d = t.dueDate != null ? _parse(t.dueDate!) : null;
      if (s == null && d == null) {
        unscheduled.add(t);
        continue;
      }
      var start = s ?? d!;
      var end = d ?? s!;
      if (start.isAfter(end)) (start, end) = (end, start);
      scheduled.add((t, start, end));
    }

    if (scheduled.isEmpty) {
      return const Center(
          child: Text('No dated tasks to plot', style: TextStyle(color: kMuted)));
    }

    var rangeStart = scheduled.first.$2;
    var rangeEnd = scheduled.first.$3;
    for (final (_, s, e) in scheduled) {
      if (s.isBefore(rangeStart)) rangeStart = s;
      if (e.isAfter(rangeEnd)) rangeEnd = e;
    }
    // A little air on both sides, and make sure today is on the axis.
    final today = DateTime.now();
    final todayDay = DateTime(today.year, today.month, today.day);
    if (todayDay.isBefore(rangeStart)) rangeStart = todayDay;
    if (todayDay.isAfter(rangeEnd)) rangeEnd = todayDay;
    rangeStart = rangeStart.subtract(const Duration(days: 1));
    rangeEnd = rangeEnd.add(const Duration(days: 2));
    final days = rangeEnd.difference(rangeStart).inDays + 1;

    int offset(DateTime d) => d.difference(rangeStart).inDays;

    // Group rows by project, alphabetical, tasks by start.
    final byProject = <String, List<(Task, DateTime, DateTime)>>{};
    for (final row in scheduled) {
      byProject.putIfAbsent(row.$1.project, () => []).add(row);
    }
    final groups = byProject.entries.toList()
      ..sort((a, b) => (widget.projectTitles[a.key] ?? a.key)
          .compareTo(widget.projectTitles[b.key] ?? b.key));
    for (final g in groups) {
      g.value.sort((a, b) => a.$2.compareTo(b.$2));
    }

    // First paint: bring today into view.
    if (!_jumped) {
      _jumped = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_hScroll.hasClients) {
          final target = (offset(todayDay) * _colW - 120)
              .clamp(0.0, _hScroll.position.maxScrollExtent);
          _hScroll.jumpTo(target);
        }
      });
    }

    final chartW = _labelW + days * _colW;

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            controller: _hScroll,
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: chartW,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 16),
                children: [
                  // Day axis header
                  SizedBox(
                    height: 40,
                    child: Row(
                      children: [
                        const SizedBox(
                            width: _labelW,
                            child: Padding(
                              padding: EdgeInsets.only(left: 12, top: 12),
                              child: Text('Task',
                                  style: TextStyle(fontSize: 11, color: kMuted)),
                            )),
                        for (var i = 0; i < days; i++)
                          _dayHeader(rangeStart.add(Duration(days: i)), todayDay),
                      ],
                    ),
                  ),
                  const Divider(height: 1),
                  for (final g in groups) ...[
                    Container(
                      width: chartW,
                      color: kCard.withValues(alpha: 0.6),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      child: Text(
                        widget.projectTitles[g.key] ?? g.key,
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700, color: kOrange),
                      ),
                    ),
                    for (final (task, start, end) in g.value)
                      SizedBox(
                        height: _rowH,
                        child: Stack(
                          children: [
                            // Today column marker
                            Positioned(
                              left: _labelW + offset(todayDay) * _colW,
                              top: 0, bottom: 0,
                              child: Container(
                                  width: _colW,
                                  color: kOrange.withValues(alpha: 0.05)),
                            ),
                            Row(
                              children: [
                                SizedBox(
                                  width: _labelW,
                                  child: Padding(
                                    padding: const EdgeInsets.only(left: 12, right: 6),
                                    child: Center(
                                      child: Align(
                                        alignment: Alignment.centerLeft,
                                        child: Text(task.title,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontSize: 11.5)),
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            Positioned(
                              left: _labelW + offset(start) * _colW + 2,
                              top: 8,
                              child: GestureDetector(
                                onTap: () => widget.onOpen(task),
                                child: Container(
                                  width: (offset(end) - offset(start) + 1) * _colW - 4,
                                  height: _rowH - 16,
                                  padding: const EdgeInsets.symmetric(horizontal: 6),
                                  alignment: Alignment.centerLeft,
                                  decoration: BoxDecoration(
                                    color: task.dueState == 'overdue'
                                        ? const Color(0xFFB91C1C)
                                        : (statusColors[task.status] ?? kMuted)
                                            .withValues(alpha: 0.85),
                                    borderRadius: BorderRadius.circular(6),
                                    border: task.dueState == 'overdue'
                                        ? Border.all(color: const Color(0xFFEF4444))
                                        : null,
                                  ),
                                  child: Text(
                                    task.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 10.5,
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
        ),
        if (unscheduled.isNotEmpty)
          SafeArea(
            top: false,
            child: ListTile(
              dense: true,
              leading: const Icon(Icons.event_busy, size: 18, color: kMuted),
              title: Text('Unscheduled (${unscheduled.length}) — no dates',
                  style: const TextStyle(fontSize: 12.5, color: kMuted)),
              onTap: () => showModalBottomSheet(
                context: context,
                backgroundColor: kCard,
                builder: (_) => ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: unscheduled.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => TaskTile(
                    task: unscheduled[i],
                    projectTitle: widget.projectTitles[unscheduled[i].project] ?? '',
                    onTap: () {
                      Navigator.pop(context);
                      widget.onOpen(unscheduled[i]);
                    },
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _dayHeader(DateTime d, DateTime today) {
    final isToday = d == today;
    return Container(
      width: _colW,
      alignment: Alignment.center,
      decoration: isToday
          ? BoxDecoration(
              color: kOrange.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(6))
          : null,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(DateFormat('E').format(d).substring(0, 1),
              style: TextStyle(
                  fontSize: 9, color: isToday ? kOrange : kMuted)),
          Text('${d.day}',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                  color: isToday ? kOrange : Colors.white)),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _hScroll.dispose();
    super.dispose();
  }
}
