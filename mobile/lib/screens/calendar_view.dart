import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../calendar_drag.dart';
import '../models.dart';
import '../task_time.dart';
import '../theme.dart';
import '../widgets/task_tile.dart';
import 'day_schedule.dart';

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

String? _timeOnDay(Task t, String key) {
  if (t.startTime != null && t.startDate?.substring(0, 10) == key) return t.startTime;
  if (t.dueTime != null && t.dueDate?.substring(0, 10) == key) return t.dueTime;
  return null;
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
/// the day gets the screen; the chevron handle expands it to a full
/// Monday-first month grid, and picking a day there collapses it back. The day
/// shows as an hour-gridline schedule or as a task list (header toggle,
/// remembered).
class CalendarView extends StatefulWidget {
  const CalendarView({
    super.key,
    required this.tasks,
    required this.projectTitles,
    required this.onOpen,
    this.onReschedule,
  });

  final List<Task> tasks;
  final Map<String, String> projectTitles;
  final void Function(Task) onOpen;

  /// Save a drag-and-drop reschedule (task fields -> values) and reload.
  /// Omit to disable dragging.
  final Future<void> Function(Task task, Map<String, Object?> values)? onReschedule;

  @override
  State<CalendarView> createState() => _CalendarViewState();
}

class _CalendarViewState extends State<CalendarView> {
  late DateTime _month; // first day of the shown month (expanded mode)
  late DateTime _selected;
  bool _expanded = false;
  bool _schedule = true;
  bool _trayOpen = false;
  static const _prefSchedule = 'calendar_day_schedule';

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month, 1);
    _selected = DateTime(now.year, now.month, now.day);
    SharedPreferences.getInstance().then((p) {
      final saved = p.getBool(_prefSchedule);
      if (saved != null && mounted) setState(() => _schedule = saved);
    });
  }

  /// Apply a drop: move the task on screen now, save through the parent (whose
  /// reload also reverts it if the server refuses), and offer Undo.
  Future<void> _drop(CalDrag drag, String toDay, {int? minutes, bool toAllDay = false}) async {
    final save = widget.onReschedule;
    if (save == null) return;
    final values = rescheduleValues(drag, toDay, minutes: minutes, toAllDay: toAllDay);
    if (values == null) return;
    final task = drag.task;
    final previous = {for (final k in values.keys) k: task.raw[k]};
    setState(() => task.raw.addAll(values));

    final messenger = ScaffoldMessenger.of(context);
    final at = DateFormat('EEE, MMM d').format(DateTime.parse(toDay));
    final time = minutes != null ? ' at ${formatTime(toServerTime('${(minutes ~/ 60).toString().padLeft(2, '0')}:${(minutes % 60).toString().padLeft(2, '0')}'))}' : '';
    await save(task, values);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(
      content: Text(toAllDay && minutes == null && drag.kind == CalDragKind.timed
          ? 'Time removed'
          : 'Moved to $at$time'),
      action: SnackBarAction(
        label: 'Undo',
        textColor: kOrange,
        onPressed: () => save(task, previous),
      ),
    ));
  }

  void _toggleSchedule() {
    setState(() => _schedule = !_schedule);
    SharedPreferences.getInstance().then((p) => p.setBool(_prefSchedule, _schedule));
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
    final selectedTasks = spans.where((s) => s.covers(selectedKey)).map((s) => s.task).toList()
      // Timed tasks first in time order (start time on the start day, due time
      // on the due day), untimed after.
      ..sort((a, b) =>
          (timeToMinutes(_timeOnDay(a, selectedKey)) ?? 24 * 60)
              .compareTo(timeToMinutes(_timeOnDay(b, selectedKey)) ?? 24 * 60));

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
    final undated = widget.tasks.where((t) => t.startDate == null && t.dueDate == null).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              // Shrinks with an ellipsis rather than pushing the buttons off a narrow screen.
              Expanded(
                child: Text(DateFormat('MMMM yyyy').format(headerMonth),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: _schedule ? 'Show as list' : 'Show hour schedule',
                icon: Icon(_schedule ? Icons.view_agenda_outlined : Icons.view_day_outlined,
                    size: 20, color: kMuted),
                onPressed: _toggleSchedule,
              ),
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
        if (hiddenOverdue.isNotEmpty || undated.isNotEmpty) _tray(hiddenOverdue, undated),
        const Divider(height: 1),
        Expanded(
          child: _schedule
              ? DaySchedule(
                  // A fresh schedule per day so it re-scrolls to that day's first task.
                  key: ValueKey(selectedKey),
                  tasks: selectedTasks,
                  dayKey: selectedKey,
                  isToday: selectedKey == todayKey,
                  onOpen: widget.onOpen,
                  onDrop: widget.onReschedule == null
                      ? null
                      : (d, {int? minutes, bool toAllDay = false}) =>
                          _drop(d, selectedKey, minutes: minutes, toAllDay: toAllDay),
                )
              : selectedTasks.isEmpty
                  ? Center(
                      child: Text('Nothing on ${DateFormat('EEE, MMM d').format(_selected)}',
                          style: const TextStyle(color: kMuted)))
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: selectedTasks.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final t = selectedTasks[i];
                        final tile = TaskTile(
                          task: t,
                          projectTitle: widget.projectTitles[t.project] ?? '',
                          onTap: () => widget.onOpen(t),
                        );
                        if (widget.onReschedule == null) return tile;
                        return LongPressDraggable<CalDrag>(
                          data: CalDrag(t, CalDragKind.chip, fromDay: selectedKey),
                          feedback: calDragFeedback(t, width: 240),
                          childWhenDragging: Opacity(opacity: 0.35, child: tile),
                          child: tile,
                        );
                      },
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
        child: DragTarget<CalDrag>(
          onWillAcceptWithDetails: (_) => widget.onReschedule != null,
          onAcceptWithDetails: (d) => _drop(d.data, key),
          builder: (context, candidates, _) {
          final hovering = candidates.isNotEmpty;
          return Container(
          height: 44,
          margin: const EdgeInsets.all(1),
          decoration: BoxDecoration(
            color: hovering
                ? kOrange.withValues(alpha: 0.35)
                : isSelected ? kOrange.withValues(alpha: 0.18) : null,
            borderRadius: BorderRadius.circular(8),
            border: hovering
                ? Border.all(color: kOrange, width: 2)
                : isSelected ? Border.all(color: kOrange) : null,
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
        );
          },
        ),
      ),
    );
  }

  /// Overdue tasks outside the visible dates and tasks with no date: a
  /// collapsible strip under the calendar. Tap a chip to open it; long-press to
  /// drag it onto a day or a time.
  Widget _tray(List<Task> overdue, List<Task> undated) {
    const red = Color(0xFFEF4444);
    final canDrag = widget.onReschedule != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: () => setState(() => _trayOpen = !_trayOpen),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: overdue.isNotEmpty ? red.withValues(alpha: 0.10) : kCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: overdue.isNotEmpty ? red.withValues(alpha: 0.4) : kBorder),
              ),
              child: Row(children: [
                Expanded(
                  child: Text.rich(
                    TextSpan(children: [
                      if (overdue.isNotEmpty)
                        TextSpan(
                            text: '⚠ ${overdue.length} overdue not in view',
                            style: const TextStyle(color: red)),
                      if (overdue.isNotEmpty && undated.isNotEmpty)
                        const TextSpan(text: '  ·  ', style: TextStyle(color: kMuted)),
                      if (undated.isNotEmpty)
                        TextSpan(
                            text: '${undated.length} with no date',
                            style: const TextStyle(color: kMuted)),
                    ]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5),
                  ),
                ),
                Icon(_trayOpen ? Icons.expand_less : Icons.expand_more, size: 18, color: kMuted),
              ]),
            ),
          ),
          if (_trayOpen) ...[
            const SizedBox(height: 6),
            SizedBox(
              height: 34,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final t in overdue) _trayChip(t, CalDragKind.overdue, canDrag),
                  for (final t in undated) _trayChip(t, CalDragKind.undated, canDrag),
                ],
              ),
            ),
            if (canDrag)
              const Padding(
                padding: EdgeInsets.only(top: 4, left: 2),
                child: Text('Long-press a task, then drop it on a day or a time',
                    style: TextStyle(fontSize: 11, color: kMuted)),
              ),
          ],
        ],
      ),
    );
  }

  Widget _trayChip(Task t, CalDragKind kind, bool canDrag) {
    final overdue = kind == CalDragKind.overdue;
    final chip = Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => widget.onOpen(t),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: kCard,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: overdue ? const Color(0xFFEF4444) : kBorder),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 200),
            child: Text(
              overdue && t.dueDate != null
                  ? '${t.title} · ${DateFormat('MMM d').format(DateTime.parse(t.dueDate!.substring(0, 10)))}'
                  : t.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 12.5, color: overdue ? const Color(0xFFEF4444) : Colors.white),
            ),
          ),
        ),
      ),
    );
    if (!canDrag) return chip;
    return LongPressDraggable<CalDrag>(
      data: CalDrag(t, kind),
      feedback: calDragFeedback(t),
      childWhenDragging: Opacity(opacity: 0.35, child: chip),
      child: chip,
    );
  }
}
