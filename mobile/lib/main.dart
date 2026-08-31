import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:url_launcher/url_launcher.dart';

/// The Ignition instance this app fronts. The whole product lives in the web
/// app; this shell adds an installable icon, splash, session persistence,
/// hardware back-button support and native file pickers.
const String kBaseUrl = 'https://erp2.v12infotech.com/ignition';
const String kHost = 'erp2.v12infotech.com';

const Color kOrange = Color(0xFFE8630A);
const Color kBlack = Color(0xFF0A0A0A);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const IgnitionApp());
}

class IgnitionApp extends StatelessWidget {
  const IgnitionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ignition',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: kOrange,
          brightness: Brightness.dark,
          surface: kBlack,
        ),
        scaffoldBackgroundColor: kBlack,
        useMaterial3: true,
      ),
      home: const IgnitionShell(),
    );
  }
}

class IgnitionShell extends StatefulWidget {
  const IgnitionShell({super.key});

  @override
  State<IgnitionShell> createState() => _IgnitionShellState();
}

class _IgnitionShellState extends State<IgnitionShell> {
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kBlack)
      ..setUserAgent('IgnitionApp/1.0 (Android; Flutter WebView)')
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() {
          _loading = true;
          _error = null;
        }),
        onPageFinished: (_) => setState(() => _loading = false),
        onWebResourceError: (err) {
          // Only surface main-frame failures; subresource hiccups are normal.
          if (err.isForMainFrame ?? false) {
            setState(() {
              _loading = false;
              _error = err.description;
            });
          }
        },
        onNavigationRequest: (request) {
          final uri = Uri.tryParse(request.url);
          if (uri == null) return NavigationDecision.navigate;
          // Keep Ignition (and its login) inside the app; hand every other
          // domain (GitHub links, PR links...) to the system browser.
          if (uri.host == kHost) return NavigationDecision.navigate;
          launchUrl(uri, mode: LaunchMode.externalApplication);
          return NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(kBaseUrl));

    // Android: wire <input type=file> to a native picker (attachments, images).
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setOnShowFileSelector((params) async {
        final result = await FilePicker.platform.pickFiles(
          allowMultiple: params.mode == FileSelectorMode.openMultiple,
        );
        if (result == null) return <String>[];
        return result.paths
            .whereType<String>()
            .map((p) => Uri.file(p).toString())
            .toList();
      });
    }
  }

  Future<bool> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false; // consumed: stay in app
    }
    return true; // at root: let Android close the app
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _handleBack() && mounted) {
          // ignore: use_build_context_synchronously
          Navigator.of(context).maybePop();
        }
      },
      child: Scaffold(
        backgroundColor: kBlack,
        body: SafeArea(
          child: _error != null
              ? _ErrorView(
                  message: _error!,
                  onRetry: () => _controller.loadRequest(Uri.parse(kBaseUrl)),
                )
              : Stack(
                  children: [
                    WebViewWidget(controller: _controller),
                    if (_loading)
                      const LinearProgressIndicator(
                        minHeight: 2,
                        color: kOrange,
                        backgroundColor: Colors.transparent,
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 48, color: kOrange),
            const SizedBox(height: 16),
            const Text('Can\'t reach Ignition',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white)),
            const SizedBox(height: 8),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, color: Colors.white54)),
            const SizedBox(height: 20),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: kOrange),
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
