import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';

import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/task_tile.dart';

class TaskDetailScreen extends StatefulWidget {
  const TaskDetailScreen({super.key, required this.taskName});
  final String taskName;

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  Task? _task;
  List<Comment> _comments = [];
  List<ChecklistTemplate> _templates = [];
  List<Attachment> _attachments = [];
  List<Assignee> _assignees = [];
  List<Member> _members = [];
  String? _error;
  final _commentCtl = TextEditingController();
  bool _sendingComment = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final task = await repo.task(widget.taskName);
      List<Comment> comments = [];
      List<ChecklistTemplate> templates = [];
      List<Attachment> attachments = [];
      List<Assignee> assignees = [];
      List<Member> members = [];
      try {
        comments = await repo.comments(widget.taskName);
      } catch (_) {}
      try {
        templates = await repo.checklistTemplates();
      } catch (_) {}
      try {
        attachments = await repo.attachments(widget.taskName);
      } catch (_) {}
      try {
        assignees = await repo.assigneesOf(widget.taskName);
      } catch (_) {}
      try {
        members = await repo.members();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _task = task;
        _comments = comments;
        _templates = templates;
        _attachments = attachments;
        _assignees = assignees;
        _members = members;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _update(Map<String, Object?> values) async {
    try {
      await repo.updateTask(widget.taskName, values);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
      await _load(); // resync after a rejected change (e.g. checklist gate)
    }
  }

  Future<void> _saveChecklist(List<ChecklistItem> items) => _update({
        'checklist': [
          for (final i in items) {'content': i.content, 'completed': i.completed ? 1 : 0},
        ],
      });

  @override
  Widget build(BuildContext context) {
    final t = _task;
    return Scaffold(
      appBar: AppBar(
        title: Text(t?.name ?? widget.taskName, style: const TextStyle(fontSize: 15)),
        actions: [
          if (t != null)
            IconButton(
              tooltip: 'Move to Bin',
              icon: const Icon(Icons.delete_outline),
              onPressed: () async {
                final yes = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    backgroundColor: kCard,
                    title: const Text('Move task to Bin?'),
                    content: const Text('You can restore it from the Bin on the web app.'),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                      FilledButton(
                          onPressed: () => Navigator.pop(ctx, true), child: const Text('Move')),
                    ],
                  ),
                );
                if (yes == true) {
                  await _update({'is_archived': 1});
                  if (context.mounted) Navigator.of(context).pop();
                }
              },
            ),
        ],
      ),
      body: _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: kMuted)))
          : t == null
              ? const Center(child: CircularProgressIndicator(color: kOrange))
              : RefreshIndicator(
                  color: kOrange,
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    children: [
                      _TitleEditor(title: t.title, onSave: (v) => _update({'title': v})),
                      const SizedBox(height: 4),
                      Text(
                        'Created ${fmtDate(t.creation, pattern: 'MMM d, yyyy')} by ${t.owner}',
                        style: const TextStyle(color: kMuted, fontSize: 12),
                      ),
                      const SizedBox(height: 16),
                      Row(children: [
                        Expanded(child: _statusPicker(t)),
                        const SizedBox(width: 10),
                        Expanded(child: _priorityPicker(t)),
                      ]),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                            child: _datePicker('Start', t.startDate,
                                (d) => _update({'start_date': d}))),
                        const SizedBox(width: 10),
                        Expanded(
                            child:
                                _datePicker('Due', t.dueDate, (d) => _update({'due_date': d}))),
                      ]),
                      const SizedBox(height: 20),
                      if ((t.description ?? '').trim().isNotEmpty) ...[
                        const Text('Description',
                            style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: HtmlWidget(t.description!,
                                textStyle:
                                    const TextStyle(fontSize: 14, color: Colors.white)),
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                      _ChecklistSection(
                        task: t,
                        templates: _templates,
                        onSave: _saveChecklist,
                      ),
                      const SizedBox(height: 20),
                      _assigneeSection(),
                      const SizedBox(height: 20),
                      _attachmentSection(),
                      const SizedBox(height: 20),
                      Text('Comments (${_comments.length})',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      for (final c in _comments)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(children: [
                                    Expanded(
                                        child: Text(c.postedBy,
                                            style: const TextStyle(
                                                fontSize: 12,
                                                color: kOrange,
                                                fontWeight: FontWeight.w600))),
                                    Text(fmtDate(c.creation, pattern: 'MMM d, HH:mm'),
                                        style:
                                            const TextStyle(fontSize: 11, color: kMuted)),
                                  ]),
                                  const SizedBox(height: 6),
                                  HtmlWidget(c.content,
                                      textStyle: const TextStyle(
                                          fontSize: 13.5, color: Colors.white)),
                                ],
                              ),
                            ),
                          ),
                        ),
                      Row(children: [
                        Expanded(
                          child: TextField(
                            controller: _commentCtl,
                            decoration: const InputDecoration(hintText: 'Add a comment…'),
                            minLines: 1,
                            maxLines: 4,
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          style: IconButton.styleFrom(backgroundColor: kOrange),
                          icon: _sendingComment
                              ? const SizedBox(
                                  width: 16, height: 16,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.send, size: 18),
                          onPressed: _sendingComment
                              ? null
                              : () async {
                                  final text = _commentCtl.text.trim();
                                  if (text.isEmpty) return;
                                  setState(() => _sendingComment = true);
                                  try {
                                    await repo.addComment(
                                        widget.taskName, '<p>$text</p>');
                                    _commentCtl.clear();
                                    await _load();
                                  } catch (e) {
                                    if (mounted) {
                                      ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(content: Text(e.toString())));
                                    }
                                  } finally {
                                    if (mounted) {
                                      setState(() => _sendingComment = false);
                                    }
                                  }
                                },
                        ),
                      ]),
                    ],
                  ),
                ),
    );
  }

  void _toast(Object e) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Widget _assigneeSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          const Text('Assignees', style: TextStyle(fontWeight: FontWeight.w700)),
          const Spacer(),
          TextButton.icon(
            icon: const Icon(Icons.person_add_alt, size: 16, color: kMuted),
            label: const Text('Add', style: TextStyle(color: kMuted, fontSize: 12)),
            onPressed: _pickAssignee,
          ),
        ]),
        if (_assignees.isEmpty)
          const Text('Unassigned', style: TextStyle(color: kMuted, fontSize: 13))
        else
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final a in _assignees)
                Chip(
                  avatar: CircleAvatar(
                    backgroundColor: kOrange,
                    child: Text(
                      a.displayName.isNotEmpty ? a.displayName[0].toUpperCase() : '?',
                      style: const TextStyle(fontSize: 11, color: Colors.white),
                    ),
                  ),
                  label: Text(a.displayName),
                  deleteIcon: const Icon(Icons.close, size: 15),
                  onDeleted: () async {
                    try {
                      await repo.unassign(widget.taskName, a.member);
                      await _load();
                    } catch (e) {
                      _toast(e);
                    }
                  },
                ),
            ],
          ),
      ],
    );
  }

  Future<void> _pickAssignee() async {
    final current = _assignees.map((a) => a.member).toSet();
    final candidates =
        _members.where((m) => !current.contains(m.name)).toList();
    if (candidates.isEmpty) {
      _toast('Everyone is already assigned');
      return;
    }
    final picked = await showModalBottomSheet<Member>(
      context: context,
      backgroundColor: kCard,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.all(14),
              child:
                  Text('Assign to', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
            for (final m in candidates)
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: kOrange,
                  child: Text(
                    m.displayName.isNotEmpty ? m.displayName[0].toUpperCase() : '?',
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                  ),
                ),
                title: Text(m.displayName),
                subtitle: Text(m.name,
                    style: const TextStyle(color: kMuted, fontSize: 11)),
                onTap: () => Navigator.pop(ctx, m),
              ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    try {
      await repo.assign(widget.taskName, [picked.name]);
      await _load();
    } catch (e) {
      _toast(e);
    }
  }

  Widget _attachmentSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          const Text('Attachments', style: TextStyle(fontWeight: FontWeight.w700)),
          const Spacer(),
          TextButton.icon(
            icon: const Icon(Icons.attach_file, size: 16, color: kMuted),
            label: const Text('Upload', style: TextStyle(color: kMuted, fontSize: 12)),
            onPressed: _upload,
          ),
        ]),
        if (_attachments.isEmpty)
          const Text('No attachments', style: TextStyle(color: kMuted, fontSize: 13))
        else
          for (final f in _attachments)
            Card(
              margin: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                dense: true,
                leading: Icon(_iconFor(f.fileName), color: kOrange, size: 20),
                title: Text(f.fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13.5)),
                subtitle: Text(_fmtSize(f.size),
                    style: const TextStyle(color: kMuted, fontSize: 11)),
                trailing: IconButton(
                  icon: const Icon(Icons.delete_outline, size: 18, color: kMuted),
                  onPressed: () => _deleteAttachment(f),
                ),
                onTap: () => _openAttachment(f),
              ),
            ),
      ],
    );
  }

  IconData _iconFor(String name) {
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    return switch (ext) {
      'png' || 'jpg' || 'jpeg' || 'gif' || 'webp' => Icons.image_outlined,
      'pdf' => Icons.picture_as_pdf_outlined,
      'doc' || 'docx' => Icons.description_outlined,
      'xls' || 'xlsx' || 'csv' => Icons.table_chart_outlined,
      'zip' || 'rar' || '7z' => Icons.folder_zip_outlined,
      _ => Icons.insert_drive_file_outlined,
    };
  }

  String _fmtSize(int bytes) {
    if (bytes <= 0) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Future<void> _upload() async {
    final result = await FilePicker.platform.pickFiles();
    final path = result?.files.single.path;
    if (path == null) return;
    final name = result!.files.single.name;
    try {
      _toast('Uploading $name…');
      await repo.uploadAttachment(widget.taskName, path, name);
      await _load();
    } catch (e) {
      _toast(e);
    }
  }

  Future<void> _openAttachment(Attachment f) async {
    try {
      // Private files need the session cookie, so download through the API
      // client into the cache and open locally.
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/${f.fileName}';
      await api.downloadFile(f.fileUrl, path);
      await OpenFilex.open(path);
    } catch (e) {
      _toast(e);
    }
  }

  Future<void> _deleteAttachment(Attachment f) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kCard,
        title: Text('Delete ${f.fileName}?'),
        content: const Text('The file is removed permanently.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await repo.deleteAttachment(f.name);
      await _load();
    } catch (e) {
      _toast(e);
    }
  }

  Widget _statusPicker(Task t) => DropdownButtonFormField<String>(
        initialValue: taskStatuses.contains(t.status) ? t.status : null,
        dropdownColor: kCard,
        decoration: const InputDecoration(labelText: 'Status'),
        items: [
          for (final s in taskStatuses) DropdownMenuItem(value: s, child: Text(s)),
        ],
        onChanged: (v) {
          if (v != null) _update({'status': v});
        },
      );

  Widget _priorityPicker(Task t) => DropdownButtonFormField<String>(
        initialValue: t.priority,
        dropdownColor: kCard,
        decoration: const InputDecoration(labelText: 'Priority'),
        items: [
          for (final p in taskPriorities) DropdownMenuItem(value: p, child: Text(p)),
        ],
        onChanged: (v) {
          if (v != null) _update({'priority': v});
        },
      );

  Widget _datePicker(String label, String? value, void Function(String?) onChanged) {
    return OutlinedButton(
      style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
          side: const BorderSide(color: kBorder)),
      onPressed: () async {
        final now = DateTime.now();
        final initial = value != null ? DateTime.tryParse(value) ?? now : now;
        final picked = await showDatePicker(
          context: context,
          initialDate: initial,
          firstDate: DateTime(2020),
          lastDate: DateTime(2035),
        );
        if (picked != null) {
          onChanged(picked.toIso8601String().substring(0, 10));
        }
      },
      onLongPress: value == null ? null : () => onChanged(null),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.event, size: 15, color: kMuted),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              value == null ? label : '$label ${fmtDate(value)}',
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: value == null ? kMuted : Colors.white, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _TitleEditor extends StatefulWidget {
  const _TitleEditor({required this.title, required this.onSave});
  final String title;
  final void Function(String) onSave;

  @override
  State<_TitleEditor> createState() => _TitleEditorState();
}

class _TitleEditorState extends State<_TitleEditor> {
  late final TextEditingController _ctl = TextEditingController(text: widget.title);

  @override
  void didUpdateWidget(covariant _TitleEditor old) {
    super.didUpdateWidget(old);
    if (old.title != widget.title && _ctl.text != widget.title) _ctl.text = widget.title;
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _ctl,
      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      decoration: const InputDecoration(
        border: InputBorder.none, enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none, filled: false, isDense: true,
        contentPadding: EdgeInsets.zero,
      ),
      maxLines: null,
      onSubmitted: (v) {
        final text = v.trim();
        if (text.isNotEmpty && text != widget.title) widget.onSave(text);
      },
    );
  }
}

class _ChecklistSection extends StatefulWidget {
  const _ChecklistSection({required this.task, required this.templates, required this.onSave});
  final Task task;
  final List<ChecklistTemplate> templates;
  final Future<void> Function(List<ChecklistItem>) onSave;

  @override
  State<_ChecklistSection> createState() => _ChecklistSectionState();
}

class _ChecklistSectionState extends State<_ChecklistSection> {
  final _newItem = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final items = widget.task.checklist;
    final done = items.where((i) => i.completed).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('Checklist', style: TextStyle(fontWeight: FontWeight.w700)),
            const Spacer(),
            if (widget.templates.isNotEmpty)
              TextButton.icon(
                icon: const Icon(Icons.playlist_add, size: 16, color: kMuted),
                label: const Text('Templates',
                    style: TextStyle(color: kMuted, fontSize: 12)),
                onPressed: _pickTemplates,
              ),
            if (items.isNotEmpty)
              Text('$done/${items.length}',
                  style: const TextStyle(color: kMuted, fontSize: 12)),
          ],
        ),
        if (items.isNotEmpty) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: items.isEmpty ? 0 : done / items.length,
              minHeight: 4,
              color: kOrange,
              backgroundColor: kBorder,
            ),
          ),
          const SizedBox(height: 6),
        ],
        for (var i = 0; i < items.length; i++)
          Dismissible(
            key: ValueKey('cl-$i-${items[i].content}'),
            direction: DismissDirection.endToStart,
            background: Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 16),
              child: const Icon(Icons.delete_outline, color: Color(0xFFEF4444)),
            ),
            onDismissed: (_) {
              final next = [...items]..removeAt(i);
              widget.onSave(next);
            },
            child: CheckboxListTile(
              value: items[i].completed,
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: kOrange,
              contentPadding: EdgeInsets.zero,
              title: Text(
                items[i].content,
                style: TextStyle(
                  fontSize: 14,
                  decoration: items[i].completed ? TextDecoration.lineThrough : null,
                  color: items[i].completed ? kMuted : Colors.white,
                ),
              ),
              onChanged: (v) {
                final next = [...items];
                next[i].completed = v ?? false;
                widget.onSave(next);
              },
            ),
          ),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _newItem,
              decoration: const InputDecoration(hintText: 'Add an item…', isDense: true),
              onSubmitted: (_) => _add(),
            ),
          ),
          IconButton(onPressed: _add, icon: const Icon(Icons.add, color: kOrange)),
        ]),
      ],
    );
  }

  void _add() {
    final text = _newItem.text.trim();
    if (text.isEmpty) return;
    _newItem.clear();
    widget.onSave([
      ...widget.task.checklist,
      ChecklistItem({'content': text, 'completed': 0}),
    ]);
  }

  Future<void> _pickTemplates() async {
    final picked = <String>{};
    final applied = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: kCard,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('Apply checklist templates',
                    style: TextStyle(fontWeight: FontWeight.w700)),
              ),
              for (final t in widget.templates)
                CheckboxListTile(
                  value: picked.contains(t.name),
                  activeColor: kOrange,
                  title: Text(t.templateName),
                  subtitle: Text('${t.items.length} items',
                      style: const TextStyle(color: kMuted, fontSize: 12)),
                  onChanged: (v) => setSheet(() {
                    v == true ? picked.add(t.name) : picked.remove(t.name);
                  }),
                ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: FilledButton(
                  onPressed: () => Navigator.pop(ctx, picked.isNotEmpty),
                  child: const Text('Apply'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (applied != true) return;
    final existing = widget.task.checklist;
    final seen = existing.map((i) => i.content.trim().toLowerCase()).toSet();
    final fresh = <ChecklistItem>[];
    for (final t in widget.templates.where((t) => picked.contains(t.name))) {
      for (final content in t.items) {
        final key = content.trim().toLowerCase();
        if (seen.add(key)) fresh.add(ChecklistItem({'content': content, 'completed': 0}));
      }
    }
    if (fresh.isNotEmpty) await widget.onSave([...existing, ...fresh]);
  }
}
