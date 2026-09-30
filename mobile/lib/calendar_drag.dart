import 'package:flutter/material.dart';

import 'models.dart';
import 'task_time.dart';
import 'theme.dart';

/// What is being dragged around the calendar. Mirrors the web calendar's
/// drag sources: an all-day chip or list card ([chip]), a block on the hour
/// grid ([timed]), and the trays ([undated], [overdue]).
enum CalDragKind { chip, timed, undated, overdue }

/// For a [CalDragKind.timed] block: whether it is a start->due window on one
/// day, or just the start time / due time landing on that day.
enum TimedField { window, start, due }

class CalDrag {
  const CalDrag(
    this.task,
    this.kind, {
    this.fromDay,
    this.field,
    this.start = 0,
    this.end = 0,
  });
  final Task task;
  final CalDragKind kind;

  /// The day the drag was grabbed from (chips and blocks).
  final String? fromDay;
  final TimedField? field;

  /// Block minutes, for keeping a window's length when it moves.
  final int start;
  final int end;
}

String _dayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime _parseDay(String key) =>
    DateTime.parse('${key.substring(0, 10)}T00:00:00');

String _hhmm(int mins) {
  final m = mins.clamp(0, 24 * 60 - 1);
  return '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}';
}

/// The task fields to save when [drag] is dropped on [toDay] — or null when
/// the drop changes nothing. Same rules as the web calendar:
///
/// - [minutes] set: dropped on the hour grid at that time (15-min snapped).
/// - [toAllDay]: dropped on the day's all-day row (a timed block loses its time).
/// - neither: dropped on a day cell in the week strip / month grid (times kept).
///
/// An undated task becomes due on [toDay]. Anything else shifts by whole days
/// (keeping its span) as if grabbed by its [CalDrag.fromDay] — for an
/// out-of-view overdue task, its due date.
Map<String, Object?>? rescheduleValues(
  CalDrag drag,
  String toDay, {
  int? minutes,
  bool toAllDay = false,
}) {
  final t = drag.task;
  if (drag.kind == CalDragKind.undated) {
    return {
      'due_date': toDay,
      if (minutes != null) 'due_time': toServerTime(_hhmm(minutes)),
    };
  }

  final fromDay = drag.kind == CalDragKind.overdue
      ? (t.dueDate ?? t.startDate ?? toDay).substring(0, 10)
      : (drag.fromDay ?? toDay);
  final delta = _parseDay(toDay).difference(_parseDay(fromDay)).inDays;
  String? shift(String? d) =>
      d == null ? null : _dayKey(_parseDay(d).add(Duration(days: delta)));
  final newStart = shift(t.startDate);
  final newDue = shift(t.dueDate);
  final values = <String, Object?>{'start_date': newStart, 'due_date': newDue};

  if (minutes != null) {
    final timed = drag.kind == CalDragKind.timed;
    if (timed && drag.field == TimedField.window) {
      values['start_time'] = toServerTime(_hhmm(minutes));
      values['due_time'] = toServerTime(
        _hhmm(minutes + (drag.end - drag.start)),
      );
    } else if (timed && drag.field == TimedField.start) {
      values['start_time'] = toServerTime(_hhmm(minutes));
    } else if (timed && drag.field == TimedField.due) {
      values['due_time'] = toServerTime(_hhmm(minutes));
    } else if (newDue == toDay) {
      values['due_time'] = toServerTime(_hhmm(minutes));
    } else if (newStart == toDay) {
      values['start_time'] = toServerTime(_hhmm(minutes));
    }
    if (delta == 0 && values.length == 2) return null;
    return values;
  }

  if (toAllDay && drag.kind == CalDragKind.timed) {
    if (drag.field == TimedField.window || drag.field == TimedField.start) {
      values['start_time'] = null;
    }
    if (drag.field == TimedField.window || drag.field == TimedField.due) {
      values['due_time'] = null;
    }
    return values;
  }

  return delta == 0 ? null : values;
}

/// The card that follows your finger while dragging.
Widget calDragFeedback(Task t, {double width = 200, double? height}) {
  final overdue = t.dueState == 'overdue';
  return Material(
    color: Colors.transparent,
    child: Container(
      width: width,
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: kCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: overdue ? const Color(0xFFEF4444) : kOrange,
          width: 1.5,
        ),
        boxShadow: const [
          BoxShadow(
            color: Colors.black54,
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Text(
        t.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
    ),
  );
}
