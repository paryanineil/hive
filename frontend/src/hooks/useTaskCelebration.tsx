import { createContext, use, useState, useCallback, useRef, useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import type { DotLottie } from "@lottiefiles/dotlottie-web"
import { motion } from "motion/react"
import confetti from "canvas-confetti"
import {
  useCelebrationSettings,
  getSoundVariantSrc,
  getAnimationVariant,
  type AnimationVariant,
  type AnimationVariantConfig,
} from "@/hooks/useCelebrationSettings"

interface CelebrationContextValue {
  /** Play the celebration. Pass a variant to preview a specific cartoon (no sound). */
  celebrate: (previewVariant?: AnimationVariant) => void
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null)

export function useCelebration() {
  const ctx = use(CelebrationContext)
  if (!ctx) throw new Error("useCelebration must be used within CelebrationProvider")
  return ctx
}

function CelebrationOverlay({
  visible,
  variant,
  animationKey,
}: {
  visible: boolean
  variant: AnimationVariantConfig
  animationKey: number
}) {
  const lottieRef = useRef<DotLottie | null>(null)
  const [shown, setShown] = useState(false)

  // Keep container mounted through the exit animation, then hide.
  useEffect(() => {
    if (visible) {
      setShown(true)
    } else if (shown) {
      const timer = setTimeout(() => setShown(false), 600)
      return () => clearTimeout(timer)
    }
  }, [visible, shown])

  // Rewind + play the Lottie each time a celebration starts.
  useEffect(() => {
    if (visible && variant.kind === "lottie" && lottieRef.current) {
      lottieRef.current.setFrame(0)
      lottieRef.current.play()
    }
  }, [visible, variant.kind, animationKey])

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[9999]"
      style={{ visibility: shown ? "visible" : "hidden" }}
    >
      <motion.div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-64"
        animate={visible ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0 }}
        initial={false}
        transition={visible
          ? { type: "spring", stiffness: 120, damping: 14, mass: 1 }
          : { type: "spring", stiffness: 200, damping: 26 }
        }
      >
        {variant.kind === "lottie" ? (
          <DotLottieReact
            key={animationKey}
            src={variant.src}
            autoplay={false}
            loop
            dotLottieRefCallback={(dotLottie) => { lottieRef.current = dotLottie }}
            style={{ width: 320, height: 320 }}
          />
        ) : (
          <div className="flex h-[320px] w-[320px] items-center justify-center select-none">
            <motion.span
              key={animationKey}
              initial={{ scale: 0.2, rotate: -20 }}
              animate={{
                scale: [0.2, 1.25, 1],
                rotate: [-20, 10, -6, 4, 0],
                y: [0, -10, 0, -6, 0],
              }}
              transition={{ duration: 1.1, times: [0, 0.4, 0.6, 0.8, 1], repeat: Infinity, repeatDelay: 0.4 }}
              style={{ fontSize: 200, lineHeight: 1, display: "inline-block", filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.25))" }}
            >
              {variant.emoji}
            </motion.span>
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  )
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [activeVariant, setActiveVariant] = useState<AnimationVariantConfig>(() => getAnimationVariant("classic"))
  const [animationKey, setAnimationKey] = useState(0)
  const dismissRef = useRef<ReturnType<typeof setTimeout>>()
  const fadeRef = useRef<ReturnType<typeof setTimeout>>()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const { animation: animationEnabled, sound: soundEnabled, soundVariant, animationVariant } = useCelebrationSettings()

  useEffect(() => {
    audioRef.current = new Audio(getSoundVariantSrc(soundVariant))
    audioRef.current.preload = "auto"
  }, [soundVariant])

  const celebrate = useCallback((previewVariant?: AnimationVariant) => {
    const isPreview = previewVariant !== undefined
    const variant = getAnimationVariant(previewVariant ?? animationVariant)

    if (!isPreview) {
      if (!animationEnabled && !soundEnabled) return
      if (visible) return
    }

    // Animation: on real completions only when enabled; always for a preview.
    if (isPreview || animationEnabled) {
      setActiveVariant(variant)
      setAnimationKey((k) => k + 1)
      setVisible(true)

      const isMobile = window.innerWidth < 768
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: isMobile ? 0.5 : 0.25, y: 0.9 },
        colors: [...variant.colors],
      })

      if (dismissRef.current) clearTimeout(dismissRef.current)
      dismissRef.current = setTimeout(() => setVisible(false), 5000)
    }

    // Sound: never for previews (the settings screen previews sound separately).
    if (!isPreview && soundEnabled) {
      try {
        const audio = audioRef.current
        if (audio) {
          audio.volume = 0.5
          audio.currentTime = 0
          audio.play().catch(() => {})

          if (fadeRef.current) clearTimeout(fadeRef.current)
          fadeRef.current = setTimeout(() => {
            const fadeSteps = 40
            const fadeInterval = 2000 / fadeSteps
            let step = 0
            const fade = setInterval(() => {
              step++
              audio.volume = Math.max(0, 0.5 * (1 - step / fadeSteps))
              if (step >= fadeSteps) {
                clearInterval(fade)
                audio.pause()
              }
            }, fadeInterval)
          }, 3000)
        }
      } catch {
        // Audio playback may be blocked by browser policy — ignore
      }
    }
  }, [visible, animationEnabled, soundEnabled, animationVariant])

  return (
    <CelebrationContext.Provider value={{ celebrate }}>
      {children}
      <CelebrationOverlay visible={visible} variant={activeVariant} animationKey={animationKey} />
    </CelebrationContext.Provider>
  )
}
