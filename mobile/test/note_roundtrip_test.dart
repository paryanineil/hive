import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_quill_delta_from_html/flutter_quill_delta_from_html.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vsc_quill_delta_to_html/vsc_quill_delta_to_html.dart';

/// The exact conversion pipeline NoteScreen uses.
Document htmlToDoc(String html) {
  if (html.trim().isEmpty) return Document();
  final delta = HtmlToDelta().convert(html);
  // Empty/whitespace notes convert to an empty delta, which Document rejects.
  if (delta.isEmpty) return Document();
  return Document.fromDelta(delta);
}

String docToHtml(Document doc) {
  final ops = doc.toDelta().toJson();
  return QuillDeltaToHtmlConverter(List.castFrom(ops)).convert();
}

void main() {
  test('typical Ignition note round-trips without losing content', () {
    const html = '<h2>Meeting notes</h2>'
        '<p>Hello <strong>bold</strong> and <em>italic</em> and <u>underline</u>.</p>'
        '<ul><li>first point</li><li>second point</li></ul>'
        '<ol><li>step one</li><li>step two</li></ol>'
        '<blockquote>a quoted thing</blockquote>'
        '<p>Link to <a href="https://example.com">example</a>.</p>';

    final doc = htmlToDoc(html);
    final text = doc.toPlainText();
    for (final expected in [
      'Meeting notes', 'bold', 'italic', 'underline',
      'first point', 'step two', 'a quoted thing', 'example',
    ]) {
      expect(text, contains(expected), reason: 'lost "$expected" in HTML->Delta');
    }

    final back = docToHtml(doc);
    for (final expected in [
      'Meeting notes', '<strong>bold</strong>', '<em>italic</em>',
      '<u>underline</u>', 'first point', 'https://example.com',
    ]) {
      expect(back, contains(expected), reason: 'lost "$expected" in Delta->HTML');
    }
    expect(back, contains('<h2>'));
    expect(back, contains('<li>'));
    expect(back, contains('<blockquote>'));
  });

  test('empty and plain content survive', () {
    expect(docToHtml(htmlToDoc('')), isA<String>());
    final doc = htmlToDoc('<p>just a line</p>');
    expect(doc.toPlainText().trim(), 'just a line');
  });
}
