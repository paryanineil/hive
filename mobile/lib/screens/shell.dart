import 'package:flutter/material.dart';

import 'notes.dart';
import 'projects.dart';
import 'more.dart';
import 'tasks.dart';

class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key, required this.onLogout});
  final VoidCallback onLogout;

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      const TasksScreen(),
      const ProjectsScreen(),
      const NotesScreen(),
      MoreScreen(onLogout: widget.onLogout),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.check_circle_outline), label: 'Tasks'),
          NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Projects'),
          NavigationDestination(icon: Icon(Icons.sticky_note_2_outlined), label: 'Notes'),
          NavigationDestination(icon: Icon(Icons.menu), label: 'More'),
        ],
      ),
    );
  }
}
