import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'theme.dart';

/// Task time-of-day helpers. Times are optional and ride alongside a date
/// (start_time with start_date, due_time with due_date). Frappe returns Time
/// fields as "9:00:00" (no leading zero) or with microseconds; the app works
/// in "HH:mm". Mirrors frontend/src/lib/taskTime.ts.

/// "HH:mm" from any Frappe/picker time value, or null when unset/invalid.
String? normalizeTime(String? value) {
  if (value == null) return null;
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(value.trim());
  if (m == null) return null;
  final h = int.parse(m.group(1)!);
  final min = int.parse(m.group(2)!);
  if (h > 23 || min > 59) return null;
  return '${h.toString().padLeft(2, '0')}:${m.group(2)}';
}

/// "HH:mm:00" for the API, or null to clear.
String? toServerTime(String? value) {
  final t = normalizeTime(value);
  return t == null ? null : '$t:00';
}

/// "9 AM" / "6:30 PM"; empty when there is no time.
String formatTime(String? value) {
  final t = normalizeTime(value);
  if (t == null) return '';
  final h = int.parse(t.substring(0, 2));
  final m = int.parse(t.substring(3, 5));
  final suffix = h < 12 ? 'AM' : 'PM';
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return m == 0 ? '$h12 $suffix' : '$h12:${m.toString().padLeft(2, '0')} $suffix';
}

/// Minutes since midnight, for comparisons.
int? timeToMinutes(String? value) {
  final t = normalizeTime(value);
  if (t == null) return null;
  return int.parse(t.substring(0, 2)) * 60 + int.parse(t.substring(3, 5));
}

String _fromTimeOfDay(TimeOfDay t) =>
    '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

TimeOfDay _toTimeOfDay(String hhmm) =>
    TimeOfDay(hour: int.parse(hhmm.substring(0, 2)), minute: int.parse(hhmm.substring(3, 5)));

/// The four time-of-day shortcuts (Morning 9 AM, Afternoon 12 PM, Evening 6 PM,
/// Night 9 PM by default), editable from the More tab and kept on this device.
class TimePresets {
  static const keys = ['morning', 'afternoon', 'evening', 'night'];
  static const labels = {
    'morning': 'Morning',
    'afternoon': 'Afternoon',
    'evening': 'Evening',
    'night': 'Night',
  };
  static const icons = {
    'morning': Icons.wb_twilight,
    'afternoon': Icons.wb_sunny_outlined,
    'evening': Icons.nights_stay_outlined,
    'night': Icons.bedtime_outlined,
  };
  static const defaults = {
    'morning': '09:00',
    'afternoon': '12:00',
    'evening': '18:00',
    'night': '21:00',
  };

  static String _prefKey(String key) => 'time_preset_$key';

  static Future<Map<String, String>> load() async {
    final prefs = await SharedPreferences.getInstance();
    return {
      for (final k in keys) k: normalizeTime(prefs.getString(_prefKey(k))) ?? defaults[k]!,
    };
  }

  static Future<void> save(String key, String hhmm) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey(key), hhmm);
  }

  static Future<void> reset() async {
    final prefs = await SharedPreferences.getInstance();
    for (final k in keys) {
      await prefs.remove(_prefKey(k));
    }
  }
}

/// Result of [pickTaskTime]: a chosen "HH:mm", or [cleared] for "No time".
class TimeChoice {
  const TimeChoice(this.time);
  const TimeChoice.cleared() : time = null;
  final String? time;
}

/// Bottom sheet with the four shortcuts, a custom time, and "No time".
/// Returns null when dismissed.
Future<TimeChoice?> pickTaskTime(BuildContext context, {String? current}) async {
  final presets = await TimePresets.load();
  if (!context.mounted) return null;
  final cur = normalizeTime(current);
  return showModalBottomSheet<TimeChoice>(
    context: context,
    backgroundColor: kCard,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 10),
              child: Text('Time', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 3.2,
              children: [
                for (final k in TimePresets.keys)
                  _presetTile(
                    icon: TimePresets.icons[k]!,
                    label: TimePresets.labels[k]!,
                    time: presets[k]!,
                    active: cur == presets[k],
                    onTap: () => Navigator.pop(ctx, TimeChoice(presets[k])),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            ListTile(
              leading: const Icon(Icons.schedule, color: kMuted),
              title: const Text('Custom time…'),
              onTap: () async {
                final picked = await showTimePicker(
                  context: ctx,
                  initialTime: cur != null ? _toTimeOfDay(cur) : TimeOfDay.now(),
                );
                if (picked != null && ctx.mounted) {
                  Navigator.pop(ctx, TimeChoice(_fromTimeOfDay(picked)));
                }
              },
            ),
            if (cur != null)
              ListTile(
                leading: const Icon(Icons.close, color: kMuted),
                title: const Text('No time'),
                onTap: () => Navigator.pop(ctx, const TimeChoice.cleared()),
              ),
          ],
        ),
      ),
    ),
  );
}

Widget _presetTile({
  required IconData icon,
  required String label,
  required String time,
  required bool active,
  required VoidCallback onTap,
}) {
  return InkWell(
    borderRadius: BorderRadius.circular(10),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: active ? kOrange.withValues(alpha: 0.15) : null,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: active ? kOrange : kBorder),
      ),
      child: Row(children: [
        Icon(icon, size: 18, color: active ? kOrange : kMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label,
              style: TextStyle(fontWeight: FontWeight.w600, color: active ? kOrange : Colors.white)),
        ),
        Text(formatTime(time), style: TextStyle(fontSize: 12, color: active ? kOrange : kMuted)),
      ]),
    ),
  );
}

/// Edit the four shortcut times (More tab).
Future<void> editTimePresets(BuildContext context) async {
  var presets = await TimePresets.load();
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: kCard,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('Time shortcuts', style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('Offered when you set a start or due time',
                  style: TextStyle(color: kMuted, fontSize: 12)),
            ),
            for (final k in TimePresets.keys)
              ListTile(
                leading: Icon(TimePresets.icons[k], color: kMuted),
                title: Text(TimePresets.labels[k]!),
                trailing: Text(formatTime(presets[k]),
                    style: const TextStyle(color: kOrange, fontWeight: FontWeight.w600)),
                onTap: () async {
                  final picked = await showTimePicker(
                      context: ctx, initialTime: _toTimeOfDay(presets[k]!));
                  if (picked == null) return;
                  final v = _fromTimeOfDay(picked);
                  await TimePresets.save(k, v);
                  setSheet(() => presets = {...presets, k: v});
                },
              ),
            TextButton(
              onPressed: () async {
                await TimePresets.reset();
                final fresh = await TimePresets.load();
                setSheet(() => presets = fresh);
              },
              child: const Text('Reset to defaults', style: TextStyle(color: kMuted)),
            ),
          ],
        ),
      ),
    ),
  );
}
