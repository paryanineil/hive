import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_quill_delta_from_html/flutter_quill_delta_from_html.dart';
import 'package:vsc_quill_delta_to_html/vsc_quill_delta_to_html.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';

import '../main.dart';
import '../models.dart';
import '../theme.dart';

class NotesScreen extends StatefulWidget {
  const NotesScreen({super.key});

  @override
  State<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends State<NotesScreen> {
  List<Note>? _notes;
  String? _error;
  /// Folder currently open; null = root. Simple drill-down navigation.
  String? _folder;
  final List<Note> _crumbs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final notes = await repo.notes();
      if (!mounted) return;
      setState(() {
        _notes = notes;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  List<Note> get _children =>
      (_notes ?? []).where((n) => n.parent == _folder).toList()
        ..sort((a, b) {
          if (a.isFolder != b.isFolder) return a.isFolder ? -1 : 1;
          return a.title.toLowerCase().compareTo(b.title.toLowerCase());
        });

  Future<void> _create(bool folder) async {
    final ctl = TextEditingController();
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: kCard,
        title: Text(folder ? 'New folder' : 'New note'),
        content: TextField(
            controller: ctl, autofocus: true,
            decoration: const InputDecoration(hintText: 'Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, ctl.text.trim()),
              child: const Text('Create')),
        ],
      ),
    );
    if (title == null || title.isEmpty) return;
    try {
      final note = await repo.createNote({
        'title': title,
        'is_folder': folder ? 1 : 0,
        if (_folder != null) 'parent_note': _folder,
      });
      await _load();
      if (!folder && mounted) _open(note);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
  }

  Future<void> _open(Note n) async {
    if (n.isFolder) {
      setState(() {
        _crumbs.add(n);
        _folder = n.name;
      });
      return;
    }
    await Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => NoteScreen(noteName: n.name)));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_crumbs.isEmpty ? 'Notes' : _crumbs.last.title),
        leading: _crumbs.isEmpty
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() {
                  _crumbs.removeLast();
                  _folder = _crumbs.isEmpty ? null : _crumbs.last.name;
                }),
              ),
      ),
      floatingActionButton: FloatingActionButton(
        child: const Icon(Icons.add),
        onPressed: () => showModalBottomSheet(
          context: context,
          backgroundColor: kCard,
          builder: (ctx) => SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ListTile(
                leading: const Icon(Icons.note_add_outlined, color: kOrange),
                title: const Text('New note'),
                onTap: () {
                  Navigator.pop(ctx);
                  _create(false);
                },
              ),
              ListTile(
                leading: const Icon(Icons.create_new_folder_outlined, color: kOrange),
                title: const Text('New folder'),
                onTap: () {
                  Navigator.pop(ctx);
                  _create(true);
                },
              ),
            ]),
          ),
        ),
      ),
      body: _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: kMuted)))
          : _notes == null
              ? const Center(child: CircularProgressIndicator(color: kOrange))
              : RefreshIndicator(
                  color: kOrange,
                  onRefresh: _load,
                  child: _children.isEmpty
                      ? ListView(children: const [
                          SizedBox(height: 160),
                          Center(
                              child: Text('Nothing here yet',
                                  style: TextStyle(color: kMuted))),
                        ])
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _children.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 6),
                          itemBuilder: (_, i) {
                            final n = _children[i];
                            return Card(
                              child: ListTile(
                                leading: Icon(
                                  n.isFolder
                                      ? Icons.folder_outlined
                                      : Icons.description_outlined,
                                  color: n.isFolder ? kOrange : kMuted,
                                ),
                                title: Text(n.title),
                                trailing: n.isFolder
                                    ? const Icon(Icons.chevron_right, color: kMuted)
                                    : null,
                                onTap: () => _open(n),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}

/// Note reader + native rich-text editor (flutter_quill).
///
/// Notes store Tiptap HTML; we convert HTML -> Delta to edit and Delta -> HTML
/// to save. Formatting the mobile editor can't represent (tables, embedded
/// images) would be flattened by a save, so notes containing those get a
/// warning before editing.
class NoteScreen extends StatefulWidget {
  const NoteScreen({super.key, required this.noteName});
  final String noteName;

  @override
  State<NoteScreen> createState() => _NoteScreenState();
}

class _NoteScreenState extends State<NoteScreen> {
  Note? _note;
  bool _editing = false;
  bool _saving = false;
  QuillController? _quill;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final n = await repo.note(widget.noteName);
      if (!mounted) return;
      setState(() {
        _note = n;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Document _htmlToDoc(String html) {
    if (html.trim().isEmpty) return Document();
    final delta = HtmlToDelta().convert(html);
    if (delta.isEmpty) return Document();
    return Document.fromDelta(delta);
  }

  String _docToHtml(Document doc) {
    final ops = doc.toDelta().toJson();
    return QuillDeltaToHtmlConverter(List.castFrom(ops)).convert();
  }

  Future<void> _startEditing() async {
    final html = _note?.content ?? '';
    final complex = RegExp(r'<(table|img)\b').hasMatch(html);
    if (complex) {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: kCard,
          title: const Text('Heads up'),
          content: const Text(
              'This note contains tables or images, which the mobile editor '
              "can't edit. Saving from here will simplify that formatting. "
              'Edit anyway?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Edit anyway')),
          ],
        ),
      );
      if (go != true) return;
    }
    try {
      final controller = QuillController(
        document: _htmlToDoc(html),
        selection: const TextSelection.collapsed(offset: 0),
      );
      setState(() {
        _quill = controller;
        _editing = true;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Could not open editor: $e')));
      }
    }
  }

  Future<void> _save() async {
    final q = _quill;
    if (q == null) return;
    setState(() => _saving = true);
    try {
      await repo.updateNote(widget.noteName, {'content': _docToHtml(q.document)});
      setState(() {
        _editing = false;
        _quill = null;
      });
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _discard() async {
    setState(() {
      _editing = false;
      _quill = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final n = _note;
    return PopScope(
      canPop: !_editing,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _editing) _discard();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(n?.title ?? ''),
          actions: [
            if (n != null && !_editing)
              IconButton(icon: const Icon(Icons.edit_outlined), onPressed: _startEditing),
            if (_editing) ...[
              TextButton(onPressed: _discard, child: const Text('Cancel', style: TextStyle(color: kMuted))),
              IconButton(
                icon: _saving
                    ? const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: kOrange))
                    : const Icon(Icons.check, color: kOrange),
                onPressed: _saving ? null : _save,
              ),
            ],
          ],
        ),
        body: _error != null
            ? Center(child: Text(_error!, style: const TextStyle(color: kMuted)))
            : n == null
                ? const Center(child: CircularProgressIndicator(color: kOrange))
                : _editing && _quill != null
                    ? Column(
                        children: [
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              child: QuillEditor.basic(
                                controller: _quill!,
                                config: const QuillEditorConfig(
                                  placeholder: 'Write…',
                                  expands: true,
                                ),
                              ),
                            ),
                          ),
                          const Divider(height: 1),
                          SafeArea(
                            top: false,
                            child: QuillSimpleToolbar(
                              controller: _quill!,
                              config: const QuillSimpleToolbarConfig(
                                multiRowsDisplay: false,
                                showFontFamily: false,
                                showFontSize: false,
                                showColorButton: false,
                                showBackgroundColorButton: false,
                                showSubscript: false,
                                showSuperscript: false,
                                showSearchButton: false,
                                showAlignmentButtons: false,
                                showIndent: false,
                                showDividers: false,
                                showClipboardCopy: false,
                                showClipboardCut: false,
                                showClipboardPaste: false,
                              ),
                            ),
                          ),
                        ],
                      )
                    : SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: (n.content ?? '').trim().isEmpty
                            ? const Text('Empty note — tap ✎ to write.',
                                style: TextStyle(color: kMuted))
                            : HtmlWidget(n.content!,
                                textStyle: const TextStyle(fontSize: 15, color: Colors.white)),
                      ),
      ),
    );
  }
}
