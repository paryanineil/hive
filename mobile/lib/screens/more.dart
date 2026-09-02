import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/client.dart';
import '../celebration.dart';
import '../notifications.dart';
import '../main.dart';
import '../theme.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key, required this.onLogout});
  final VoidCallback onLogout;

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  String? _user;
  bool _celebrate = true;
  bool _notifications = true;

  @override
  void initState() {
    super.initState();
    api.loggedUser().then((u) {
      if (mounted) setState(() => _user = u);
    }).catchError((_) {});
    Celebration.enabled().then((on) {
      if (mounted) setState(() => _celebrate = on);
    });
    AppNotifications.enabled().then((on) {
      if (mounted) setState(() => _notifications = on);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Card(
            child: ListTile(
              leading: const CircleAvatar(
                  backgroundColor: kOrange,
                  child: Icon(Icons.person, color: Colors.white)),
              title: Text(_user ?? '…'),
              subtitle: const Text('Signed in', style: TextStyle(color: kMuted, fontSize: 12)),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.public, color: kMuted),
                title: const Text('Open Ignition on the web'),
                subtitle: const Text('Dashboard, calendar, timeline & settings',
                    style: TextStyle(color: kMuted, fontSize: 12)),
                onTap: () => launchUrl(Uri.parse('$kBaseUrl$kAppPath'),
                    mode: LaunchMode.externalApplication),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.bug_report_outlined, color: kMuted),
                title: const Text('Report an issue'),
                onTap: () => launchUrl(
                    Uri.parse('https://github.com/paryanineil/hive/issues/new'),
                    mode: LaunchMode.externalApplication),
              ),
            ]),
          ),
          const SizedBox(height: 8),
          Card(
            child: Column(children: [
              SwitchListTile(
                secondary: const Icon(Icons.notifications_outlined, color: kMuted),
                title: const Text('Notifications'),
                subtitle: const Text('New assignments and a daily due-task summary',
                    style: TextStyle(color: kMuted, fontSize: 12)),
                activeThumbColor: kOrange,
                value: _notifications,
                onChanged: (on) {
                  setState(() => _notifications = on);
                  AppNotifications.setEnabled(on);
                },
              ),
              const Divider(height: 1),
              SwitchListTile(
                secondary: const Icon(Icons.celebration_outlined, color: kMuted),
                title: const Text('Celebrations'),
                subtitle: const Text('Confetti and sound when you complete a task',
                    style: TextStyle(color: kMuted, fontSize: 12)),
                activeThumbColor: kOrange,
                value: _celebrate,
                onChanged: (on) {
                  setState(() => _celebrate = on);
                  Celebration.setEnabled(on);
                  if (on) Celebration.show(context);
                },
              ),
            ]),
          ),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.logout, color: Color(0xFFEF4444)),
              title: const Text('Log out'),
              onTap: () async {
                await api.logout();
                widget.onLogout();
              },
            ),
          ),
          const SizedBox(height: 20),
          const Center(
            child: Text('Ignition · native app v2.0\nV12 Infotech',
                textAlign: TextAlign.center,
                style: TextStyle(color: kMuted, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
