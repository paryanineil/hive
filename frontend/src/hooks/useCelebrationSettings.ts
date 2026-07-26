import { useSyncExternalStore } from "react"

const ANIMATION_KEY = "hive:celebration-animation"
const SOUND_KEY = "hive:celebration-sound"
const SOUND_VARIANT_KEY = "hive:celebration-sound-variant"
const ANIMATION_VARIANT_KEY = "hive:celebration-animation-variant"

const SOUND_BASE = "/assets/bwh_hive/frontend/sounds"

export const SOUND_VARIANTS = [
  { value: "victory", label: "Victory Fanfare", src: `${SOUND_BASE}/victory.wav` },
  { value: "task-complete", label: "Task Complete Ding", src: `${SOUND_BASE}/task-complete.mp3` },
  { value: "chime-ascend", label: "Level-Up Chime", src: `${SOUND_BASE}/chime-ascend.wav` },
  { value: "success-bells", label: "Success Bells", src: `${SOUND_BASE}/success-bells.wav` },
  { value: "fanfare-lite", label: "Mini Fanfare", src: `${SOUND_BASE}/fanfare-lite.wav` },
  { value: "power-up", label: "Power Up", src: `${SOUND_BASE}/power-up.wav` },
  { value: "coin", label: "Coin", src: `${SOUND_BASE}/coin.wav` },
  { value: "sparkle", label: "Sparkle", src: `${SOUND_BASE}/sparkle.wav` },
  { value: "marimba", label: "Marimba", src: `${SOUND_BASE}/marimba.wav` },
  { value: "zen-bell", label: "Zen Bell", src: `${SOUND_BASE}/zen-bell.wav` },
] as const

export type SoundVariant = (typeof SOUND_VARIANTS)[number]["value"]

const DEFAULT_SOUND_VARIANT: SoundVariant = "victory"

// The celebration "cartoon" shown when a task is completed. "classic" is the
// original Lottie animation; the rest are self-contained animated emoji so they
// work offline with no extra assets. `colors` themes the confetti burst.
export const ANIMATION_VARIANTS = [
  { value: "classic", label: "Classic Confetti", emoji: "🎉", kind: "lottie", src: "/assets/bwh_hive/frontend/sounds/celebration.lottie", colors: ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3", "#54a0ff", "#5f27cd"] },
  { value: "party", label: "Party Popper", emoji: "🎉", kind: "emoji", colors: ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3", "#54a0ff", "#5f27cd"] },
  { value: "tada", label: "Celebrate", emoji: "🥳", kind: "emoji", colors: ["#ff9ff3", "#feca57", "#ff6b6b", "#54a0ff"] },
  { value: "rocket", label: "Rocket", emoji: "🚀", kind: "emoji", colors: ["#54a0ff", "#48dbfb", "#c8d6e5", "#ff6b6b", "#feca57"] },
  { value: "trophy", label: "Trophy", emoji: "🏆", kind: "emoji", colors: ["#feca57", "#ff9f43", "#f6b93b", "#fad390"] },
  { value: "star", label: "Superstar", emoji: "🌟", kind: "emoji", colors: ["#feca57", "#ffeaa7", "#fff200", "#f6e58d"] },
  { value: "fire", label: "On Fire", emoji: "🔥", kind: "emoji", colors: ["#ff6b6b", "#ff9f43", "#feca57", "#ee5253"] },
  { value: "clap", label: "Applause", emoji: "👏", kind: "emoji", colors: ["#f6b93b", "#feca57", "#ffeaa7", "#fab1a0"] },
  { value: "muscle", label: "Strong Finish", emoji: "💪", kind: "emoji", colors: ["#ff6b6b", "#54a0ff", "#feca57", "#1dd1a1"] },
  { value: "unicorn", label: "Unicorn Magic", emoji: "🦄", kind: "emoji", colors: ["#ff9ff3", "#feca57", "#48dbfb", "#a29bfe", "#fd79a8"] },
] as const

export type AnimationVariant = (typeof ANIMATION_VARIANTS)[number]["value"]
export type AnimationVariantConfig = (typeof ANIMATION_VARIANTS)[number]

const DEFAULT_ANIMATION_VARIANT: AnimationVariant = "classic"

function isSoundVariant(v: string | null): v is SoundVariant {
  return v !== null && SOUND_VARIANTS.some((s) => s.value === v)
}

function isAnimationVariant(v: string | null): v is AnimationVariant {
  return v !== null && ANIMATION_VARIANTS.some((s) => s.value === v)
}

function getBoolSnapshot(key: string, defaultValue: boolean): () => boolean {
  return () => {
    const v = localStorage.getItem(key)
    return v === null ? defaultValue : v === "true"
  }
}

function getSoundVariantSnapshot(): SoundVariant {
  const v = localStorage.getItem(SOUND_VARIANT_KEY)
  return isSoundVariant(v) ? v : DEFAULT_SOUND_VARIANT
}

function getAnimationVariantSnapshot(): AnimationVariant {
  const v = localStorage.getItem(ANIMATION_VARIANT_KEY)
  return isAnimationVariant(v) ? v : DEFAULT_ANIMATION_VARIANT
}

const subscribers = new Set<() => void>()
function subscribe(cb: () => void) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

export function notify() {
  subscribers.forEach((cb) => cb())
}

export const CELEBRATION_KEYS = { ANIMATION_KEY, SOUND_KEY, SOUND_VARIANT_KEY, ANIMATION_VARIANT_KEY } as const

export function useCelebrationSettings() {
  const animation = useSyncExternalStore(subscribe, getBoolSnapshot(ANIMATION_KEY, true))
  const sound = useSyncExternalStore(subscribe, getBoolSnapshot(SOUND_KEY, true))
  const soundVariant = useSyncExternalStore(subscribe, getSoundVariantSnapshot)
  const animationVariant = useSyncExternalStore(subscribe, getAnimationVariantSnapshot)
  return { animation, sound, soundVariant, animationVariant }
}

export function getSoundVariantSrc(variant: SoundVariant): string {
  const match = SOUND_VARIANTS.find((s) => s.value === variant)
  return match ? match.src : SOUND_VARIANTS[0].src
}

export function getAnimationVariant(variant: AnimationVariant): AnimationVariantConfig {
  return ANIMATION_VARIANTS.find((a) => a.value === variant) ?? ANIMATION_VARIANTS[0]
}
