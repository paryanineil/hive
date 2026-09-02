import 'dart:math';

import 'package:audioplayers/audioplayers.dart';
import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'theme.dart';

/// Same spirit as the web app's completion celebration: confetti, a big
/// cartoon pop, and a chime. Toggleable from the More tab ('celebrate' pref).
class Celebration {
  static const prefKey = 'celebrate';
  static final _player = AudioPlayer();
  static final _rng = Random();

  // Mirrors the web's cartoon variants in emoji form.
  static const _cartoons = ['🎉', '🏆', '🚀', '⭐', '💪', '🔥', '👏', '🥳', '✨', '🎯'];

  static Future<bool> enabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(prefKey) ?? true;
  }

  static Future<void> setEnabled(bool on) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(prefKey, on);
  }

  /// Fire the celebration over the current screen. Safe to call from any
  /// context inside the app; does nothing if the user turned it off.
  static Future<void> show(BuildContext context) async {
    if (!await enabled()) return;
    if (!context.mounted) return;

    final overlay = Overlay.of(context, rootOverlay: true);
    final emoji = _cartoons[_rng.nextInt(_cartoons.length)];
    final entry = OverlayEntry(builder: (_) => _CelebrationOverlay(emoji: emoji));
    overlay.insert(entry);

    // Sound is best-effort — never let audio problems break the flow.
    try {
      await _player.stop();
      await _player.play(AssetSource('sounds/task-complete.mp3'));
    } catch (_) {}

    Future.delayed(const Duration(milliseconds: 2200), () {
      if (entry.mounted) entry.remove();
    });
  }
}

class _CelebrationOverlay extends StatefulWidget {
  const _CelebrationOverlay({required this.emoji});
  final String emoji;

  @override
  State<_CelebrationOverlay> createState() => _CelebrationOverlayState();
}

class _CelebrationOverlayState extends State<_CelebrationOverlay>
    with SingleTickerProviderStateMixin {
  late final ConfettiController _confetti;
  late final AnimationController _pop;

  @override
  void initState() {
    super.initState();
    _confetti = ConfettiController(duration: const Duration(milliseconds: 900))..play();
    _pop = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))
      ..forward();
  }

  @override
  void dispose() {
    _confetti.dispose();
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Pop in fast, hold, fade out.
    final scale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.15), weight: 12),
      TweenSequenceItem(tween: Tween(begin: 1.15, end: 1.0), weight: 8),
      TweenSequenceItem(tween: ConstantTween(1.0), weight: 80),
    ]).animate(CurvedAnimation(parent: _pop, curve: Curves.easeOut));
    final fade = TweenSequence<double>([
      TweenSequenceItem(tween: ConstantTween(1.0), weight: 75),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 25),
    ]).animate(_pop);

    return IgnorePointer(
      child: Stack(children: [
        Align(
          alignment: Alignment.topCenter,
          child: ConfettiWidget(
            confettiController: _confetti,
            blastDirectionality: BlastDirectionality.explosive,
            numberOfParticles: 28,
            maxBlastForce: 24,
            minBlastForce: 8,
            gravity: 0.25,
            emissionFrequency: 0.02,
            colors: const [kOrange, Color(0xFF22C55E), Color(0xFF3B82F6), Color(0xFFEAB308), Colors.white],
          ),
        ),
        Center(
          child: FadeTransition(
            opacity: fade,
            child: ScaleTransition(
              scale: scale,
              child: Text(widget.emoji, style: const TextStyle(fontSize: 84)),
            ),
          ),
        ),
      ]),
    );
  }
}
