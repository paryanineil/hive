import 'package:flutter/material.dart';

/// Ignition brand — matches the web app's black + orange OKLCH palette.
const kOrange = Color(0xFFE8630A);
const kOrangeBright = Color(0xFFFF7A1A);
const kBg = Color(0xFF0F0F0F);
const kCard = Color(0xFF1A1A1A);
const kBorder = Color(0xFF2A2A2A);
const kMuted = Color(0xFF8A8A8A);

const statusColors = <String, Color>{
  'Someday': Color(0xFFB48AE0),
  'Backlog': Color(0xFF7A7A7A),
  'To Do': Color(0xFFEAB308),
  'In Progress': Color(0xFF3B82F6),
  'Done': Color(0xFF22C55E),
  'Blocked': Color(0xFFEF4444),
};

const priorityColors = <String, Color>{
  'Urgent': Color(0xFFEF4444),
  'High': Color(0xFFF97316),
  'Medium': Color(0xFFEAB308),
  'Low': Color(0xFF94A3B8),
};

const taskStatuses = ['Someday', 'Backlog', 'To Do', 'In Progress', 'Done', 'Blocked'];
const taskPriorities = ['Low', 'Medium', 'High', 'Urgent'];

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: kOrange,
    brightness: Brightness.dark,
    surface: kBg,
  ).copyWith(primary: kOrange, secondary: kOrangeBright);

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: kBg,
    appBarTheme: const AppBarTheme(
      backgroundColor: kBg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
    ),
    cardTheme: const CardThemeData(
      color: kCard,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(12)),
        side: BorderSide(color: kBorder),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kCard,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: kOrange),
      ),
      hintStyle: const TextStyle(color: kMuted),
    ),
    dividerTheme: const DividerThemeData(color: kBorder, thickness: 1),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: kCard,
      contentTextStyle: TextStyle(color: Colors.white),
      behavior: SnackBarBehavior.floating,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(backgroundColor: kOrange, foregroundColor: Colors.white),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: kOrange,
      foregroundColor: Colors.white,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kCard,
      side: const BorderSide(color: kBorder),
      labelStyle: const TextStyle(color: Colors.white, fontSize: 12),
      selectedColor: kOrange.withValues(alpha: 0.25),
      showCheckmark: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: kBg,
      indicatorColor: kOrange.withValues(alpha: 0.22),
      iconTheme: WidgetStatePropertyAll(const IconThemeData(color: Colors.white)),
      labelTextStyle: const WidgetStatePropertyAll(TextStyle(fontSize: 11, color: Colors.white)),
    ),
  );
}
