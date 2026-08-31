import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models.dart';
import '../theme.dart';
import '../widgets/task_tile.dart';

String _dayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// A task occupies every day from start to due (inclusive); one date alone is a
/// single day. Comparison is on YYYY-MM-DD strings — chronological and
/// timezone-safe, mirroring the web calendar.
class _Span {
  _Span(this.task, this.from, this.to);
  final Task task;
  final String from;
  final String to;
  bool covers(String key) => from.compareTo(key) <= 0 && key.compareTo(to) <= 0;
}

List<_Span> _buildSpans(List<Task> tasks) {
  final spans = <_Span>[];
  for (final t in tasks) {
    final s = t.startDate?.substring(0, 10);
    final d = t.dueDate?.substring(0, 10);
    if (s == null && d == null) continue;
    var from = s ?? d!;
    var to = d ?? s!;
    if (from.compareTo(to) > 0) (from, to) = (to, from);
    spans.add(_Span(t, from, to));
  }
  return spans;
}

/// Month calendar (Monday-first) with a tasks-for-selected-day list below.
class CalendarView extends StatefulWidget {
  const CalendarView({
    super.key,
    required this.tasks,
    required this.projectTitles,
    required this.onOpen,
  });

  final List<Task> tasks;
  final Map<String, String> projectTitles;
  final void Function(Task) onOpen;

  @override
  State<CalendarView> createState() => _CalendarViewState();
}

class _CalendarViewState extends State<CalendarView> {
  late DateTime _month; // first day of the shown month
  late DateTime _selected;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month, 1);
    _selected = DateTime(now.year, now.month, now.day);
  }

  @override
  Widget build(BuildContext context) {
    final spans = _buildSpans(widget.tasks);

    // Monday-first grid covering the whole month.
    final lead = (_month.weekday - DateTime.monday) % 7;
    final gridStart = _month.subtract(Duration(days: lead));
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final cells = ((lead + daysInMonth) / 7).ceil() * 7;

    final todayKey = _dayKey(DateTime.now());
    final selectedKey = _dayKey(_selected);
    final selectedTasks = spans.where((s) => s.covers(selectedKey)).map((s) => s.task).toList();

    // Overdue tasks whose span never touches the visible month.
    final monthStart = _dayKey(gridStart);
    final monthEnd = _dayKey(gridStart.add(Duration(days: cells - 1)));
    final hiddenOverdue = spans
        .where((s) => s.task.dueState == 'overdue')
        .where((s) => s.to.compareTo(monthStart) < 0 || s.from.compareTo(monthEnd) > 0)
        .map((s) => s.task)
        .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(
            children: [
              Text(DateFormat('MMMM yyyy').format(_month),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const Spacer(),
              TextButton(
                onPressed: () => setState(() {
                  final now = DateTime.now();
                  _month = DateTime(now.year, now.month, 1);
                  _selected = DateTime(now.year, now.month, now.day);
                }),
                child: const Text('Today', style: TextStyle(color: kOrange)),
              ),
              IconButton(
                icon: const Icon(Icons.chevron_left),
                onPressed: () =>
                    setState(() => _month = DateTime(_month.year, _month.month - 1, 1)),
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right),
                onPressed: () =>
                    setState(() => _month = DateTime(_month.year, _month.month + 1, 1)),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              for (final w in const ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])
                Expanded(
                    child: Center(
                        child: Text(w,
                            style: const TextStyle(fontSize: 11, color: kMuted)))),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Column(
            children: [
              for (var row = 0; row < cells ~/ 7; row++)
                Row(
                  children: [
                    for (var col = 0; col < 7; col++)
                      _dayCell(gridStart.add(Duration(days: row * 7 + col)), spans,
                          todayKey, selectedKey),
                  ],
                ),
            ],
          ),
        ),
        if (hiddenOverdue.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: InkWell(
              onTap: () => _showList(context, 'Overdue', hiddenOverdue),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.4)),
                ),
                child: Text(
                  '⚠ ${hiddenOverdue.length} overdue task${hiddenOverdue.length == 1 ? '' : 's'} outside this month — tap to view',
                  style: const TextStyle(color: Color(0xFFEF4444), fontSize: 12.5),
                ),
              ),
            ),
          ),
        const SizedBox(height: 4),
        const Divider(height: 1),
        Expanded(
          child: selectedTasks.isEmpty
              ? Center(
                  child: Text('Nothing on ${DateFormat('EEE, MMM d').format(_selected)}',
                      style: const TextStyle(color: kMuted)))
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: selectedTasks.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => TaskTile(
                    task: selectedTasks[i],
                    projectTitle: widget.projectTitles[selectedTasks[i].project] ?? '',
                    onTap: () => widget.onOpen(selectedTasks[i]),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _dayCell(DateTime day, List<_Span> spans, String todayKey, String selectedKey) {
    final key = _dayKey(day);
    final inMonth = day.month == _month.month;
    final dayTasks = spans.where((s) => s.covers(key)).toList();
    final isToday = key == todayKey;
    final isSelected = key == selectedKey;

    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selected = day),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          height: 52,
          margin: const EdgeInsets.all(1),
          decoration: BoxDecoration(
            color: isSelected ? kOrange.withValues(alpha: 0.18) : null,
            borderRadius: BorderRadius.circular(8),
            border: isSelected ? Border.all(color: kOrange) : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 24, height: 24,
                alignment: Alignment.center,
                decoration: isToday
                    ? const BoxDecoration(color: kOrange, shape: BoxShape.circle)
                    : null,
                child: Text(
                  '${day.day}',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                    color: isToday
                        ? Colors.white
                        : inMonth
                            ? Colors.white
                            : kMuted.withValues(alpha: 0.5),
                  ),
                ),
              ),
              const SizedBox(height: 3),
              SizedBox(
                height: 6,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final s in dayTasks.take(3))
                      Container(
                        width: 5, height: 5,
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: s.task.dueState == 'overdue'
                              ? const Color(0xFFEF4444)
                              : statusColors[s.task.status] ?? kMuted,
                        ),
                      ),
                    if (dayTasks.length > 3)
                      const Text('+', style: TextStyle(fontSize: 7, color: kMuted)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showList(BuildContext context, String title, List<Task> tasks) {
    showModalBottomSheet(
      context: context,
      backgroundColor: kCard,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (_, controller) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Text('$title (${tasks.length})',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            Expanded(
              child: ListView.separated(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                itemCount: tasks.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => TaskTile(
                  task: tasks[i],
                  projectTitle: widget.projectTitles[tasks[i].project] ?? '',
                  onTap: () {
                    Navigator.pop(context);
                    widget.onOpen(tasks[i]);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
