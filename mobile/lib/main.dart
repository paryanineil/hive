import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart' show FlutterQuillLocalizations;

import 'api/client.dart';
import 'api/repo.dart';
import 'screens/login.dart';
import 'screens/shell.dart';
import 'theme.dart';

/// Simple app-wide service locator — one client, one repo.
late final ApiClient api;
late final Repo repo;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  api = await ApiClient.create();
  repo = Repo(api);
  runApp(const IgnitionApp());
}

class IgnitionApp extends StatelessWidget {
  const IgnitionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ignition',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      // Required by flutter_quill widgets at runtime.
      localizationsDelegates: FlutterQuillLocalizations.localizationsDelegates,
      supportedLocales: FlutterQuillLocalizations.supportedLocales,
      home: const _Gate(),
    );
  }
}

/// Decides between login and the app based on the stored session.
class _Gate extends StatefulWidget {
  const _Gate();

  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  bool? _loggedIn;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    bool ok = false;
    try {
      ok = await api.hasSession();
    } catch (_) {
      // Offline at launch: show login, it surfaces the error on submit.
    }
    if (mounted) setState(() => _loggedIn = ok);
  }

  @override
  Widget build(BuildContext context) {
    if (_loggedIn == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: kOrange)),
      );
    }
    return _loggedIn!
        ? ShellScreen(onLogout: () => setState(() => _loggedIn = false))
        : LoginScreen(onLoggedIn: () => setState(() => _loggedIn = true));
  }
}
