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

/// Calendar with the day's tasks below. Opens as a compact one-week strip so
/// the task list gets the screen; the chevron handle expands it to a full
/// Monday-first month grid, and picking a day there collapses it back.
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
  late DateTime _month; // first day of the shown month (expanded mode)
  late DateTime _selected;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month, 1);
    _selected = DateTime(now.year, now.month, now.day);
  }

  /// Monday of the week containing [d].
  DateTime _weekStart(DateTime d) =>
      DateTime(d.year, d.month, d.day).subtract(Duration(days: (d.weekday - DateTime.monday) % 7));

  void _shift(int direction) {
    setState(() {
      if (_expanded) {
        _month = DateTime(_month.year, _month.month + direction, 1);
      } else {
        _selected = _selected.add(Duration(days: 7 * direction));
        _month = DateTime(_selected.year, _selected.month, 1);
      }
    });
  }

  void _goToday() {
    setState(() {
      final now = DateTime.now();
      _month = DateTime(now.year, now.month, 1);
      _selected = DateTime(now.year, now.month, now.day);
    });
  }

  @override
  Widget build(BuildContext context) {
    final spans = _buildSpans(widget.tasks);
    final todayKey = _dayKey(DateTime.now());
    final selectedKey = _dayKey(_selected);
    final selectedTasks = spans.where((s) => s.covers(selectedKey)).map((s) => s.task).toList();

    // Visible range: the month grid or the single week strip.
    late final DateTime rangeStart;
    late final int rangeDays;
    if (_expanded) {
      final lead = (_month.weekday - DateTime.monday) % 7;
      rangeStart = _month.subtract(Duration(days: lead));
      final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
      rangeDays = ((lead + daysInMonth) / 7).ceil() * 7;
    } else {
      rangeStart = _weekStart(_selected);
      rangeDays = 7;
    }

    // Overdue tasks whose span never touches the visible range.
    final rangeStartKey = _dayKey(rangeStart);
    final rangeEndKey = _dayKey(rangeStart.add(Duration(days: rangeDays - 1)));
    final hiddenOverdue = spans
        .where((s) => s.task.dueState == 'overdue')
        .where((s) => s.to.compareTo(rangeStartKey) < 0 || s.from.compareTo(rangeEndKey) > 0)
        .map((s) => s.task)
        .toList();

    final headerMonth = _expanded ? _month : _selected;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              Text(DateFormat('MMMM yyyy').format(headerMonth),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const Spacer(),
              TextButton(
                onPressed: _goToday,
                child: const Text('Today', style: TextStyle(color: kOrange)),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.chevron_left),
                onPressed: () => _shift(-1),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.chevron_right),
                onPressed: () => _shift(1),
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
        // Week strip or month grid — animated so the collapse feels deliberate.
        AnimatedSize(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          alignment: Alignment.topCenter,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            child: Column(
              children: [
                for (var row = 0; row < rangeDays ~/ 7; row++)
                  Row(
                    children: [
                      for (var col = 0; col < 7; col++)
                        _dayCell(rangeStart.add(Duration(days: row * 7 + col)), spans,
                            todayKey, selectedKey),
                    ],
                  ),
              ],
            ),
          ),
        ),
        // Expand/collapse handle.
        InkWell(
          onTap: () => setState(() {
            _expanded = !_expanded;
            if (_expanded) _month = DateTime(_selected.year, _selected.month, 1);
          }),
          child: SizedBox(
            width: double.infinity,
            height: 22,
            child: Icon(
              _expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
              size: 18,
              color: kMuted,
            ),
          ),
        ),
        if (hiddenOverdue.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
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
                  '⚠ ${hiddenOverdue.length} overdue task${hiddenOverdue.length == 1 ? '' : 's'} not in view — tap to see',
                  style: const TextStyle(color: Color(0xFFEF4444), fontSize: 12.5),
                ),
              ),
            ),
          ),
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
    // In week mode there is no "current month" — every day reads as in-month.
    final inMonth = !_expanded || day.month == _month.month;
    final dayTasks = spans.where((s) => s.covers(key)).toList();
    final isToday = key == todayKey;
    final isSelected = key == selectedKey;

    return Expanded(
      child: InkWell(
        onTap: () => setState(() {
          _selected = day;
          // Picking a day from the month grid folds it away so the tasks show.
          if (_expanded) {
            _expanded = false;
            _month = DateTime(day.year, day.month, 1);
          }
        }),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          height: 44,
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
                width: 22, height: 22,
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
              const SizedBox(height: 2),
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
