import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import 'api/client.dart';

/// Notifications without Firebase: a WorkManager job polls the server every
/// 15 minutes (Android's minimum) and raises local notifications for
/// - tasks newly assigned to you, and
/// - a once-a-day morning summary of due-today / overdue counts.
///
/// If an FCM setup ever lands, this module is the seam to swap it in.
class AppNotifications {
  static const prefEnabled = 'notifications_enabled';
  static const _prefKnown = 'notif_known_assigned';
  static const _prefSummaryDate = 'notif_summary_date';
  static const _pollTask = 'ignition.poll';

  static final _plugin = FlutterLocalNotificationsPlugin();

  static Future<void> _initPlugin() async {
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _plugin.initialize(settings: settings);
  }

  static Future<bool> enabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(prefEnabled) ?? true;
  }

  /// Called from the shell once the user is signed in. Requests the runtime
  /// notification permission (Android 13+) and schedules the poll if enabled.
  static Future<void> setupIfEnabled() async {
    if (!await enabled()) return;
    await _initPlugin();
    try {
      await _plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    } catch (_) {}
    await _schedule();
  }

  static Future<void> setEnabled(bool on) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(prefEnabled, on);
    if (on) {
      await setupIfEnabled();
    } else {
      await Workmanager().cancelByUniqueName(_pollTask);
    }
  }

  static Future<void> _schedule() async {
    // Cancel-then-register so a re-enable always lands cleanly.
    await Workmanager().cancelByUniqueName(_pollTask);
    await Workmanager().registerPeriodicTask(
      _pollTask,
      _pollTask,
      frequency: const Duration(minutes: 15),
      constraints: Constraints(networkType: NetworkType.connected),
    );
  }

  static Future<void> _show(int id, String title, String body) async {
    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        'ignition_tasks',
        'Task updates',
        channelDescription: 'New assignments and due-date reminders',
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
      ),
    );
    await _plugin.show(id: id, title: title, body: body, notificationDetails: details);
  }

  /// The actual poll — runs in the WorkManager background isolate.
  static Future<void> check() async {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool(prefEnabled) ?? true)) return;

    final client = await ApiClient.create();
    if (!await client.hasSession()) return;
    await _initPlugin();

    final user = await client.loggedUser();
    final open = await client.getList(
      'Hive Task',
      fields: ['name', 'title', 'due_date', 'status', '_assign'],
      filters: [
        ['status', '!=', 'Done'],
        ['is_archived', '=', 0],
      ],
      limit: 500,
    );

    await _checkNewAssignments(prefs, user, open);
    await _maybeDailySummary(prefs, open);
  }

  /// Tasks whose `_assign` JSON contains [user]. Pure, for tests.
  static List<Map<String, dynamic>> assignedTo(List<Map<String, dynamic>> open, String user) =>
      open.where((t) {
        final assign = t['_assign'];
        return assign is String && assign.contains('"$user"');
      }).toList();

  /// Summary fragments for [today] (yyyy-MM-dd), e.g. ["2 due today", "1 overdue"].
  /// Empty when there is nothing worth notifying. Pure, for tests.
  static List<String> summaryParts(List<Map<String, dynamic>> open, String today) {
    var dueToday = 0, overdue = 0;
    for (final t in open) {
      if (t['status'] == 'Someday') continue;
      final due = (t['due_date'] as String?)?.substring(0, 10);
      if (due == null) continue;
      if (due == today) {
        dueToday++;
      } else if (due.compareTo(today) < 0) {
        overdue++;
      }
    }
    return [
      if (dueToday > 0) '$dueToday due today',
      if (overdue > 0) '$overdue overdue',
    ];
  }

  static Future<void> _checkNewAssignments(
    SharedPreferences prefs,
    String user,
    List<Map<String, dynamic>> open,
  ) async {
    final mine = assignedTo(open, user);
    final names = mine.map((t) => t['name'] as String).toSet();

    final storedList = prefs.getStringList(_prefKnown);
    if (storedList == null) {
      // First run: seed silently so existing tasks don't spam.
      await prefs.setStringList(_prefKnown, names.toList());
      return;
    }

    final known = storedList.toSet();
    final fresh = mine.where((t) => !known.contains(t['name'])).toList();
    if (fresh.isNotEmpty) {
      if (fresh.length <= 3) {
        for (final t in fresh) {
          await _show((t['name'] as String).hashCode, 'New task assigned',
              (t['title'] as String?) ?? (t['name'] as String));
        }
      } else {
        await _show(1001, 'New tasks assigned', '${fresh.length} tasks were assigned to you');
      }
    }
    // Store the full current set: forgets unassigned/completed tasks, so a
    // task re-assigned to you later correctly notifies again.
    await prefs.setStringList(_prefKnown, names.toList());
  }

  static Future<void> _maybeDailySummary(
    SharedPreferences prefs,
    List<Map<String, dynamic>> open,
  ) async {
    final now = DateTime.now();
    if (now.hour < 8) return;
    final today =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    if (prefs.getString(_prefSummaryDate) == today) return;

    final parts = summaryParts(open, today);
    // Mark the day even when there's nothing to say — no empty notifications.
    await prefs.setString(_prefSummaryDate, today);
    if (parts.isEmpty) return;
    await _show(1002, 'Ignition — today', parts.join(' · '));
  }
}

/// WorkManager background entry point. Must be a top-level function.
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    try {
      await AppNotifications.check();
    } catch (_) {
      // Swallow errors — WorkManager retries on the next period anyway.
    }
    return true;
  });
}
