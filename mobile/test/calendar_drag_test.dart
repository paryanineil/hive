import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/calendar_drag.dart';
import 'package:ignition_mobile/models.dart';
import 'package:ignition_mobile/screens/calendar_view.dart';
import 'package:ignition_mobile/screens/day_schedule.dart';
import 'package:ignition_mobile/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

Task _t(String name, Map<String, Object?> fields) =>
    Task({'name': name, 'title': 'Task $name', 'status': 'To Do', ...fields});

String _key(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Long-press [from], drag by [by] in steps, release.
Future<void> _longPressDrag(WidgetTester tester, Finder from, Offset by) async {
  final gesture = await tester.startGesture(tester.getCenter(from));
  await tester.pump(kLongPressTimeout + const Duration(milliseconds: 100));
  for (var i = 1; i <= 10; i++) {
    await gesture.moveBy(by / 10);
    await tester.pump(const Duration(milliseconds: 16));
  }
  await gesture.up();
  await tester.pumpAndSettle();
}

void main() {
  group('rescheduleValues (same rules as the web calendar)', () {
    test('undated task becomes due on the drop day, with the slot time on the grid', () {
      final t = _t('u', {});
      expect(rescheduleValues(CalDrag(t, CalDragKind.undated), '2026-09-30'), {'due_date': '2026-09-30'});
      expect(rescheduleValues(CalDrag(t, CalDragKind.undated), '2026-09-30', minutes: 18 * 60),
          {'due_date': '2026-09-30', 'due_time': '18:00:00'});
    });

    test('out-of-view overdue task moves by its due date, keeping its span', () {
      final t = _t('o', {'start_date': '2026-09-18', 'due_date': '2026-09-20'});
      expect(rescheduleValues(CalDrag(t, CalDragKind.overdue), '2026-09-30'),
          {'start_date': '2026-09-28', 'due_date': '2026-09-30'});
    });

    test('chip moved to another day keeps times; same day is a no-op', () {
      final t = _t('c', {'due_date': '2026-09-28'});
      final drag = CalDrag(t, CalDragKind.chip, fromDay: '2026-09-28');
      expect(rescheduleValues(drag, '2026-09-30'), {'start_date': null, 'due_date': '2026-09-30'});
      expect(rescheduleValues(drag, '2026-09-28'), isNull);
    });

    test('chip dropped on the grid gets a due time on the day it lands', () {
      final t = _t('c', {'due_date': '2026-09-28'});
      expect(rescheduleValues(CalDrag(t, CalDragKind.chip, fromDay: '2026-09-28'), '2026-09-28', minutes: 9 * 60),
          {'start_date': null, 'due_date': '2026-09-28', 'due_time': '09:00:00'});
    });

    test('a start->due window keeps its length when moved on the grid', () {
      final t = _t('w', {'start_date': '2026-09-28', 'start_time': '10:00:00', 'due_date': '2026-09-28', 'due_time': '12:30:00'});
      final drag = CalDrag(t, CalDragKind.timed, fromDay: '2026-09-28', field: TimedField.window, start: 600, end: 750);
      expect(rescheduleValues(drag, '2026-09-28', minutes: 14 * 60), {
        'start_date': '2026-09-28',
        'due_date': '2026-09-28',
        'start_time': '14:00:00',
        'due_time': '16:30:00',
      });
    });

    test('a timed block dropped on the all-day row loses its time', () {
      final t = _t('d', {'due_date': '2026-09-28', 'due_time': '18:00:00'});
      final drag = CalDrag(t, CalDragKind.timed, fromDay: '2026-09-28', field: TimedField.due, start: 1080, end: 1140);
      expect(rescheduleValues(drag, '2026-09-28', toAllDay: true),
          {'start_date': null, 'due_date': '2026-09-28', 'due_time': null});
    });

    test('multi-day task grabbed mid-span shifts its dates without inventing a time', () {
      final t = _t('m', {'start_date': '2026-09-27', 'due_date': '2026-09-29'});
      final drag = CalDrag(t, CalDragKind.chip, fromDay: '2026-09-28');
      expect(rescheduleValues(drag, '2026-09-29', minutes: 600), {'start_date': '2026-09-28', 'due_date': '2026-09-30'});
    });
  });

  testWidgets('DaySchedule: long-press drag moves a block to a new time and onto All day', (tester) async {
    final drops = <String>[];
    final tasks = [_t('x', {'due_date': '2026-09-28', 'due_time': '9:00:00'})];
    await tester.binding.setSurfaceSize(const Size(360, 700));
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Scaffold(
        body: DaySchedule(
          tasks: tasks,
          dayKey: '2026-09-28',
          isToday: false,
          onOpen: (_) {},
          onDrop: (d, {int? minutes, bool toAllDay = false}) =>
              drops.add('${d.task.name}:${minutes ?? '-'}:${toAllDay ? 'allday' : 'grid'}'),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    // Down by two rows' worth: 9 AM -> 11 AM. Row height = grid height / 12.
    final grid = tester.getSize(find.byType(SingleChildScrollView).last);
    final hour = (grid.height / 12).clamp(30.0, 72.0);
    await _longPressDrag(tester, find.textContaining('Task x'), Offset(0, hour * 2));
    expect(drops, ['x:660:grid']);

    // Up into the all-day row clears the time.
    final allDay = tester.getCenter(find.text('All day'));
    final block = tester.getCenter(find.textContaining('Task x'));
    await _longPressDrag(tester, find.textContaining('Task x'), Offset(0, allDay.dy - block.dy));
    expect(drops.last, 'x:-:allday');
    expect(tester.takeException(), isNull);
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('CalendarView: a no-date task dragged from the tray onto a day gets that due date', (tester) async {
    SharedPreferences.setMockInitialValues({'calendar_day_schedule': false});
    final saved = <String, Map<String, Object?>>{};
    final tasks = [_t('nodate', {})];
    await tester.binding.setSurfaceSize(const Size(390, 800));
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Scaffold(
        body: CalendarView(
          tasks: tasks,
          projectTitles: const {},
          onOpen: (_) {},
          onReschedule: (t, values) async => saved[t.name] = values,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('with no date'));
    await tester.pumpAndSettle();

    // Drop it on this week's Monday in the week strip.
    final now = DateTime.now();
    final monday = DateTime(now.year, now.month, now.day).subtract(Duration(days: (now.weekday - DateTime.monday) % 7));
    final chip = tester.getCenter(find.text('Task nodate'));
    final day = tester.getCenter(find.text('${monday.day}').first);
    await _longPressDrag(tester, find.text('Task nodate'), day - chip);

    expect(saved['nodate'], {'due_date': _key(monday)});
    expect(find.textContaining('Moved to'), findsOneWidget);
    await tester.binding.setSurfaceSize(null);
  });
}
