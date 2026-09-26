import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/models.dart';
import 'package:ignition_mobile/task_time.dart';

String _dayKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

void main() {
  test('normalizeTime accepts Frappe shapes', () {
    expect(normalizeTime('9:00:00'), '09:00');
    expect(normalizeTime('18:30:00.000000'), '18:30');
    expect(normalizeTime('0:01:00'), '00:01');
    expect(normalizeTime(null), isNull);
    expect(normalizeTime('25:00'), isNull);
  });

  test('formatTime / toServerTime / timeToMinutes', () {
    expect(formatTime('09:00'), '9 AM');
    expect(formatTime('12:00:00'), '12 PM');
    expect(formatTime('00:00'), '12 AM');
    expect(formatTime('18:30'), '6:30 PM');
    expect(formatTime(null), '');
    expect(toServerTime('9:05'), '09:05:00');
    expect(toServerTime(null), isNull);
    expect(timeToMinutes('21:15:00'), 1275);
  });

  test('dueState turns overdue once a due-today time has passed', () {
    final now = DateTime.now();
    final today = _dayKey(now);
    Task t(String? time) => Task({'name': 'x', 'status': 'To Do', 'due_date': today, 'due_time': time});

    expect(t(null).dueState, 'today', reason: 'untimed stays due today all day');
    // 00:00 has always passed by the time the test runs (except in its first minute).
    if (now.hour * 60 + now.minute > 0) expect(t('0:00:00').dueState, 'overdue');
    // 23:59 is never strictly before "now" (minute resolution).
    expect(t('23:59:00').dueState, 'today');

    final yesterday = _dayKey(now.subtract(const Duration(days: 1)));
    expect(Task({'name': 'y', 'status': 'To Do', 'due_date': yesterday}).dueState, 'overdue');
    expect(Task({'name': 'z', 'status': 'Done', 'due_date': today, 'due_time': '0:00:00'}).dueState,
        'none');
  });
}
