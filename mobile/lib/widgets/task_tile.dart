import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models.dart';
import '../theme.dart';

Color dueColor(String state) => switch (state) {
      'overdue' => const Color(0xFFEF4444),
      'today' => const Color(0xFFF59E0B),
      _ => kMuted,
    };

String fmtDate(String? iso, {String pattern = 'MMM d'}) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso);
  return d == null ? '' : DateFormat(pattern).format(d);
}

class TaskTile extends StatelessWidget {
  const TaskTile({super.key, required this.task, required this.projectTitle, this.onTap});
  final Task task;
  final String projectTitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final due = task.dueState;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Container(
                      width: 8, height: 8,
                      decoration: BoxDecoration(
                        color: statusColors[task.status] ?? kMuted,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(task.title,
                        style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                  ),
                  if (due == 'overdue')
                    const Icon(Icons.warning_amber_rounded, size: 16, color: Color(0xFFEF4444)),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  _pill(task.status, statusColors[task.status] ?? kMuted),
                  _pill(task.priority, priorityColors[task.priority] ?? kMuted),
                  if (projectTitle.isNotEmpty)
                    Text(projectTitle, style: const TextStyle(color: kMuted, fontSize: 12)),
                  if (task.dueDate != null)
                    Text(
                      due == 'today'
                          ? 'Today'
                          : '${fmtDate(task.dueDate)}${due == 'overdue' ? ' · overdue' : ''}',
                      style: TextStyle(
                          color: dueColor(due),
                          fontSize: 12,
                          fontWeight: due == 'upcoming' ? FontWeight.w400 : FontWeight.w600),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pill(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.45)),
        ),
        child: Text(text, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
      );
}
