import 'package:flutter_test/flutter_test.dart';
import 'package:ignition_mobile/notifications.dart';

void main() {
  test('assignedTo matches only tasks whose _assign contains the user', () {
    final open = [
      {'name': 'TASK-1', '_assign': '["kamal@v12infotech.com"]'},
      {'name': 'TASK-2', '_assign': '["neil@v12infotech.com", "kamal@v12infotech.com"]'},
      {'name': 'TASK-3', '_assign': '["neil@v12infotech.com"]'},
      {'name': 'TASK-4', '_assign': null},
      {'name': 'TASK-5'},
    ];
    final mine = AppNotifications.assignedTo(open, 'kamal@v12infotech.com');
    expect(mine.map((t) => t['name']), ['TASK-1', 'TASK-2']);
  });

  test('summaryParts counts due-today and overdue, skips Someday and undated', () {
    final open = [
      {'name': 'a', 'status': 'To Do', 'due_date': '2026-09-02'},
      {'name': 'b', 'status': 'In Progress', 'due_date': '2026-09-02 00:00:00'},
      {'name': 'c', 'status': 'To Do', 'due_date': '2026-08-30'},
      {'name': 'd', 'status': 'Someday', 'due_date': '2026-08-01'},
      {'name': 'e', 'status': 'To Do', 'due_date': null},
      {'name': 'f', 'status': 'Backlog', 'due_date': '2026-09-10'},
    ];
    expect(AppNotifications.summaryParts(open, '2026-09-02'), ['2 due today', '1 overdue']);
    expect(AppNotifications.summaryParts([], '2026-09-02'), isEmpty);
  });
}
