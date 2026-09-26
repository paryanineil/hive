import 'dart:async';

import 'package:flutter/material.dart';

import '../models.dart';
import '../task_time.dart';
import '../theme.dart';

const double _hourPx = 56;
const double _gutter = 48;
const int _dayMin = 24 * 60;

/// Deadline-style tasks (a single time) draw as a one-hour block, matching the
/// web grid and the Google Calendar sync.
const int _defaultMin = 60;

/// A timed task's block on one day. Mirrors layoutDay in the web TaskTimeGrid.
class TimedBlock {
  TimedBlock(
    this.task,
    this.start,
    this.end, {
    required this.window,
    required this.due,
  });
  final Task task;
  final int start;
  final int end;
  final bool window; // start->due on this one day
  final bool due; // a lone due time (vs a lone start time)
  int col = 0;
  int cols = 1;
}

TimedBlock? timedBlockFor(Task t, String dayKey) {
  final s = t.startDate?.substring(0, 10) == dayKey
      ? timeToMinutes(t.startTime)
      : null;
  final d = t.dueDate?.substring(0, 10) == dayKey
      ? timeToMinutes(t.dueTime)
      : null;
  if (s != null && d != null) {
    return TimedBlock(
      t,
      s,
      d > s ? d : (s + _defaultMin).clamp(0, _dayMin),
      window: true,
      due: false,
    );
  }
  final at = s ?? d;
  if (at == null) return null;
  return TimedBlock(
    t,
    at,
    (at + _defaultMin).clamp(0, _dayMin),
    window: false,
    due: s == null,
  );
}

/// Timed blocks with overlap columns assigned, plus the all-day remainder.
({List<TimedBlock> timed, List<Task> allDay}) layoutDay(
  List<Task> tasks,
  String dayKey,
) {
  final allDay = <Task>[];
  final timed = <TimedBlock>[];
  for (final t in tasks) {
    final b = timedBlockFor(t, dayKey);
    if (b == null) {
      allDay.add(t);
    } else {
      timed.add(b);
    }
  }
  timed.sort(
    (a, b) => a.start != b.start
        ? a.start.compareTo(b.start)
        : b.end.compareTo(a.end),
  );

  var cluster = <TimedBlock>[];
  var colEnds = <int>[];
  var clusterEnd = -1;
  void close() {
    for (final b in cluster) {
      b.cols = colEnds.length;
    }
    cluster = [];
    colEnds = [];
  }

  for (final b in timed) {
    if (b.start >= clusterEnd) close();
    var col = colEnds.indexWhere((end) => end <= b.start);
    if (col == -1) {
      col = colEnds.length;
      colEnds.add(b.end);
    } else {
      colEnds[col] = b.end;
    }
    b.col = col;
    cluster.add(b);
    if (b.end > clusterEnd) clusterEnd = b.end;
  }
  close();
  return (timed: timed, allDay: allDay);
}

String _minsLabel(int m) {
  final c = m.clamp(0, _dayMin - 1);
  return formatTime(
    '${(c ~/ 60).toString().padLeft(2, '0')}:${(c % 60).toString().padLeft(2, '0')}',
  );
}

/// One day with hour gridlines: all-day chips on top, timed tasks as blocks at
/// their time (side by side when they overlap), and a now-line on today.
class DaySchedule extends StatefulWidget {
  const DaySchedule({
    super.key,
    required this.tasks,
    required this.dayKey,
    required this.isToday,
    required this.onOpen,
  });

  final List<Task> tasks;
  final String dayKey;
  final bool isToday;
  final void Function(Task) onOpen;

  @override
  State<DaySchedule> createState() => _DayScheduleState();
}

class _DayScheduleState extends State<DaySchedule> {
  late final ScrollController _scroll;
  Timer? _tick;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    // Open at the first timed task (or now on today, else 8 AM), an hour early.
    final starts = layoutDay(
      widget.tasks,
      widget.dayKey,
    ).timed.map((b) => b.start).toList();
    final nowMin = _now.hour * 60;
    var target = widget.isToday ? nowMin : 8 * 60;
    if (starts.isNotEmpty) {
      final first = starts.reduce((a, b) => a < b ? a : b);
      target = widget.isToday && nowMin < first ? nowMin : first;
    }
    _scroll = ScrollController(
      initialScrollOffset: ((target - 60).clamp(0, _dayMin) / 60) * _hourPx,
    );
    _tick = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  Color _colorFor(Task t) => t.dueState == 'overdue'
      ? const Color(0xFFEF4444)
      : (statusColors[t.status] ?? kMuted);

  @override
  Widget build(BuildContext context) {
    final laid = layoutDay(widget.tasks, widget.dayKey);
    return Column(
      children: [
        if (laid.allDay.isNotEmpty)
          Container(
            width: double.infinity,
            constraints: const BoxConstraints(maxHeight: 96),
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: kBorder)),
            ),
            child: SingleChildScrollView(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(
                    width: _gutter - 8,
                    child: Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text(
                        'All day',
                        style: TextStyle(fontSize: 10, color: kMuted),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [for (final t in laid.allDay) _allDayChip(t)],
                    ),
                  ),
                ],
              ),
            ),
          ),
        Expanded(
          child: SingleChildScrollView(
            controller: _scroll,
            child: SizedBox(
              height: 24 * _hourPx + 8,
              child: LayoutBuilder(
                builder: (context, box) {
                  final colsWidth = box.maxWidth - _gutter - 8;
                  return Stack(
                    children: [
                      // Hour + half-hour gridlines and labels.
                      for (var h = 0; h < 24; h++) ...[
                        Positioned(
                          top: h * _hourPx,
                          left: _gutter,
                          right: 0,
                          child: Container(
                            height: 1,
                            color: h == 0 ? Colors.transparent : kBorder,
                          ),
                        ),
                        Positioned(
                          top: h * _hourPx + _hourPx / 2,
                          left: _gutter,
                          right: 0,
                          child: Container(
                            height: 1,
                            color: kBorder.withValues(alpha: 0.35),
                          ),
                        ),
                        if (h > 0)
                          Positioned(
                            top: h * _hourPx - 7,
                            left: 0,
                            width: _gutter - 6,
                            child: Text(
                              formatTime('${h.toString().padLeft(2, '0')}:00'),
                              textAlign: TextAlign.right,
                              style: const TextStyle(
                                fontSize: 10,
                                color: kMuted,
                              ),
                            ),
                          ),
                      ],
                      for (final b in laid.timed)
                        Positioned(
                          top: b.start / 60 * _hourPx + 1,
                          height: ((b.end - b.start) / 60 * _hourPx - 2).clamp(
                            24.0,
                            double.infinity,
                          ),
                          left: _gutter + 2 + colsWidth * b.col / b.cols,
                          width: colsWidth / b.cols - 4,
                          child: _block(
                            b,
                            compact: (b.end - b.start) / 60 * _hourPx < 40,
                          ),
                        ),
                      if (widget.isToday)
                        Positioned(
                          top:
                              (_now.hour * 60 + _now.minute) / 60 * _hourPx - 1,
                          left: _gutter - 4,
                          right: 0,
                          child: Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: kOrange,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              Expanded(
                                child: Container(height: 2, color: kOrange),
                              ),
                            ],
                          ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _allDayChip(Task t) {
    final overdue = t.dueState == 'overdue';
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => widget.onOpen(t),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: kCard,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: overdue ? const Color(0xFFEF4444) : kBorder,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: _colorFor(t),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 220),
              child: Text(
                t.title,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  color: overdue ? const Color(0xFFEF4444) : Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _block(TimedBlock b, {required bool compact}) {
    final t = b.task;
    final overdue = t.dueState == 'overdue';
    final range = b.window
        ? '${_minsLabel(b.start)} – ${_minsLabel(b.end)}'
        : '${b.due ? 'Due ' : ''}${_minsLabel(b.start)}';
    final titleStyle = TextStyle(
      fontSize: 12.5,
      fontWeight: FontWeight.w600,
      color: overdue ? const Color(0xFFEF4444) : Colors.white,
    );
    final title = '${overdue ? '⚠ ' : ''}${t.title}';
    return Material(
      color: kCard,
      borderRadius: BorderRadius.circular(8),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => widget.onOpen(t),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: overdue ? const Color(0xFFEF4444) : kBorder,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(width: 4, color: _colorFor(t)),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 3,
                  ),
                  child: compact
                      // Too short for two lines: "Title · 6 PM" on one.
                      ? Align(
                          alignment: Alignment.centerLeft,
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: title, style: titleStyle),
                                TextSpan(
                                  text: '  $range',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: kMuted,
                                  ),
                                ),
                              ],
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: titleStyle,
                            ),
                            Text(
                              range,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11,
                                color: kMuted,
                              ),
                            ),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
