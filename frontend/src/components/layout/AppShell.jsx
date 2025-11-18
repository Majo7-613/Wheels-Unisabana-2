import { motion } from "framer-motion";
import { useTheme } from "../../context/ThemeContext.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

export default function AppShell({ children }) {
  const { palette } = useTheme();
  return (
    <div className="relative min-h-screen w-full overflow-hidden text-slate-900">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 -z-40 bg-gradient-to-br ${palette.background}`}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-1/3 top-[-20%] h-[70vh] w-[90vw] rounded-full blur-3xl"
        animate={{
          opacity: [0.35, 0.6, 0.35],
          scale: [1, 1.08, 1]
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: palette.glow }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute bottom-[-30%] right-[-25%] h-[60vh] w-[80vw] rounded-full blur-3xl"
        animate={{
          opacity: [0.3, 0.55, 0.3],
          scale: [1.1, 0.95, 1.1]
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: palette.glow }}
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 backdrop-blur-xl bg-black/10 border-b border-white/10">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center">
                <span className="absolute inset-0 rounded-xl bg-white/20 blur-sm" />
                <span className="relative rounded-xl bg-white/30 px-2 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white">
                  WS
                </span>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.5em] text-white/70">Wheels Sabana</p>
                <p className="text-lg font-semibold text-white">Mobility Network</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-white/10 bg-black/20 backdrop-blur-xl py-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 text-xs text-white/60">
            <span>© {new Date().getFullYear()} Wheels Sabana Collective</span>
            <span>Teleporting commuters with trust, data & design.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
