import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface Props {
  state?: OrbState;
  size?: number;
  className?: string;
  bars?: boolean;
}

/**
 * Animated AI orb: layered gradient core, breathing rings and an audio-style
 * waveform. Purely CSS/SVG driven so it stays smooth and works offline.
 */
export function AiOrb({ state = 'idle', size = 128, className = '', bars = true }: Props) {
  const { reducedMotion } = useTheme();
  const ring = state === 'listening' || state === 'speaking';
  const hue = state === 'error' ? 'from-rose-500/40 to-amber-400/30' : 'from-violet-500/30 to-cyan-400/30';

  return (
    <div className={`relative grid place-items-center ${className}`} style={{ width: size, height: size }} aria-hidden>
      {ring && !reducedMotion && (
        <>
          <span className="absolute inset-0 animate-pulse-ring rounded-full border border-violet-400/40" />
          <span className="absolute inset-0 animate-pulse-ring rounded-full border border-cyan-300/30" style={{ animationDelay: '0.8s' }} />
        </>
      )}
      <motion.div
        animate={
          reducedMotion
            ? undefined
            : {
                scale: state === 'listening' ? [1, 1.06, 1] : state === 'speaking' ? [1, 1.08, 1] : [1, 1.03, 1],
                rotate: state === 'thinking' ? 360 : 0,
              }
        }
        transition={
          state === 'thinking'
            ? { duration: 6, repeat: Infinity, ease: 'linear' }
            : { duration: state === 'idle' ? 5 : 1.6, repeat: Infinity, ease: 'easeInOut' }
        }
        className="relative rounded-full"
        style={{ width: size * 0.72, height: size * 0.72 }}
      >
        <div className="absolute inset-0 rounded-full orb-core" />
        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${hue} blur-xl`} />
        <div className="absolute inset-[18%] rounded-full bg-white/10 backdrop-blur-sm" />
        <div className="absolute left-[26%] top-[22%] h-[18%] w-[18%] rounded-full bg-white/60 blur-[6px]" />
      </motion.div>

      {bars && (
        <div className="absolute inset-x-0 bottom-1 flex h-6 items-end justify-center gap-[3px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-gradient-to-t from-cyan-400/70 to-violet-400/80"
              animate={
                reducedMotion || state === 'idle'
                  ? { height: 4 }
                  : {
                      height:
                        state === 'speaking'
                          ? [6, 18, 9, 22, 7, 16, 10]
                          : state === 'listening'
                            ? [4, 10, 6, 14, 5, 9, 4]
                            : [8, 14, 10, 18, 9],
                    }
              }
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.08, ease: 'easeInOut' }}
              style={{ height: 4 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
