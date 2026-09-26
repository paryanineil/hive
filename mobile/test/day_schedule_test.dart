import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/models.dart';
import 'package:ignition_mobile/screens/day_schedule.dart';
import 'package:ignition_mobile/theme.dart';

const _day = '2026-09-28';

Task _t(String name, Map<String, Object?> fields) =>
    Task({'name': name, 'title': 'Task $name', 'status': 'To Do', ...fields});

void main() {
  test('layoutDay: blocks, all-day remainder and overlap columns', () {
    final tasks = [
      _t('allday', {'due_date': _day}),
      _t('x', {'due_date': _day, 'due_time': '9:00:00'}), // 9-10
      _t('y', {'start_date': _day, 'start_time': '9:30:00', 'due_date': _day, 'due_time': '11:00:00'}),
      _t('z', {'due_date': _day, 'due_time': '10:30:00'}), // reuses x's column
      _t('w', {'due_date': _day, 'due_time': '14:00:00'}), // alone
      _t('multi', {'start_date': '2026-09-27', 'start_time': '9:00:00', 'due_date': '2026-09-29'}),
    ];
    final laid = layoutDay(tasks, _day);
    expect(laid.allDay.map((t) => t.name), ['allday', 'multi']);
    expect(laid.timed.map((b) => '${b.task.name}:${b.col}/${b.cols}'), ['x:0/2', 'y:1/2', 'z:0/2', 'w:0/1']);
    final y = laid.timed.firstWhere((b) => b.task.name == 'y');
    expect([y.start, y.end, y.window], [570, 660, true]);
    final w = laid.timed.firstWhere((b) => b.task.name == 'w');
    expect([w.start, w.end, w.due], [840, 900, true]);
  });

  testWidgets('DaySchedule renders without layout overflow', (tester) async {
    final opened = <String>[];
    final tasks = [
      _t('allday', {'due_date': _day}),
      _t('long', {'due_date': _day, 'title': 'A very long task title that must ellipsize cleanly in a narrow block'}),
      _t('x', {'due_date': _day, 'due_time': '9:00:00'}),
      _t('y', {'start_date': _day, 'start_time': '9:30:00', 'due_date': _day, 'due_time': '9:45:00'}), // 15-min: compact
      _t('z', {'due_date': _day, 'due_time': '9:40:00'}),
      _t('late', {'due_date': _day, 'due_time': '23:30:00'}),
    ];
    await tester.binding.setSurfaceSize(const Size(360, 700));
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Scaffold(
        body: DaySchedule(tasks: tasks, dayKey: _day, isToday: false, onOpen: (t) => opened.add(t.name)),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('All day'), findsOneWidget);
    expect(find.textContaining('Task x'), findsOneWidget);

    await tester.tap(find.textContaining('Task x'));
    expect(opened, ['x']);
    await tester.binding.setSurfaceSize(null);
  });
}
