import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ignition_mobile/theme.dart';

void main() {
  testWidgets('theme builds and renders', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: const Scaffold(body: Text('Ignition')),
    ));
    expect(find.text('Ignition'), findsOneWidget);
  });
}
