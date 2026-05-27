// Q版黑貓占卜師 – pure inline SVG, no external assets needed.
// The `.cat-float` animation is defined in globals.css.

export function CatFortuneIllustration() {
  return (
    <div className="cat-float relative mx-auto flex max-w-[300px] items-center justify-center sm:max-w-[340px]">
      <svg
        viewBox="0 0 220 280"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full drop-shadow-[0_8px_40px_rgba(109,77,242,0.35)]"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="cfi-eye-l" cx="38%" cy="32%" r="58%">
            <stop offset="0%" stopColor="#f5d442" />
            <stop offset="55%" stopColor="#d49010" />
            <stop offset="100%" stopColor="#7a4e00" />
          </radialGradient>
          <radialGradient id="cfi-eye-r" cx="38%" cy="32%" r="58%">
            <stop offset="0%" stopColor="#f5d442" />
            <stop offset="55%" stopColor="#d49010" />
            <stop offset="100%" stopColor="#7a4e00" />
          </radialGradient>
          <radialGradient id="cfi-crystal" cx="30%" cy="28%" r="72%">
            <stop offset="0%" stopColor="rgba(203,184,255,0.60)" />
            <stop offset="42%" stopColor="rgba(109,77,242,0.50)" />
            <stop offset="100%" stopColor="rgba(8,10,32,0.88)" />
          </radialGradient>
        </defs>

        {/* Ambient glow behind the whole figure */}
        <ellipse cx="110" cy="212" rx="86" ry="56" fill="rgba(109,77,242,0.10)" />

        {/* ── Background stars ──────────────────────── */}
        <circle cx="28"  cy="36"  r="2.2" fill="#f7f1df" opacity="0.82" />
        <circle cx="185" cy="28"  r="1.8" fill="#cbb8ff" opacity="0.72" />
        <circle cx="200" cy="80"  r="2.4" fill="#f7f1df" opacity="0.62" />
        <circle cx="15"  cy="125" r="1.6" fill="#8ef0dd" opacity="0.68" />
        <circle cx="205" cy="158" r="1.9" fill="#cbb8ff" opacity="0.58" />
        <circle cx="24"  cy="200" r="1.4" fill="#f7f1df" opacity="0.52" />
        <circle cx="192" cy="222" r="1.6" fill="#cbb8ff" opacity="0.46" />

        {/* ✦ sparkle symbols */}
        <text x="10"  y="56"  fill="#d8bd70" fontSize="13" opacity="0.82">✦</text>
        <text x="178" y="52"  fill="#cbb8ff" fontSize="10" opacity="0.68">✦</text>
        <text x="8"   y="162" fill="#d8bd70" fontSize="9"  opacity="0.58">✦</text>
        <text x="196" y="130" fill="#8ef0dd" fontSize="8"  opacity="0.52">✦</text>

        {/* ── Tail (behind body – drawn first) ──────── */}
        <path
          d="M142 222 Q168 212 170 190 Q173 170 157 165"
          fill="none"
          stroke="#16103a"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* ── Cat body ──────────────────────────────── */}
        <path
          d="M73 172 Q66 200 70 226 Q110 238 150 226 Q154 200 147 172 Q110 162 73 172Z"
          fill="#16103a"
        />

        {/* ── Crystal ball pedestal ──────────────────── */}
        <path
          d="M88 262 Q110 258 132 262 L129 268 Q110 270 91 268Z"
          fill="#2d1550"
          opacity="0.72"
        />
        <rect x="92" y="256" width="36" height="7" rx="3.5" fill="#3a1a62" opacity="0.60" />

        {/* Crystal ball outer glow rings */}
        <circle cx="110" cy="238" r="40" fill="rgba(203,184,255,0.06)" />
        <circle cx="110" cy="238" r="32" fill="rgba(203,184,255,0.10)" />

        {/* Crystal ball */}
        <circle cx="110" cy="238" r="26" fill="url(#cfi-crystal)" />
        {/* Inner shine / highlight */}
        <ellipse cx="100" cy="228" rx="9" ry="6" fill="white" opacity="0.26" />
        <circle  cx="120" cy="225" r="3.5"          fill="white" opacity="0.13" />

        {/* ── Paws (in front of crystal ball) ──────── */}
        <ellipse cx="90"  cy="234" rx="13" ry="8" fill="#1c1445" />
        <ellipse cx="130" cy="234" rx="13" ry="8" fill="#1c1445" />

        {/* ── Head ─────────────────────────────────── */}
        <circle cx="110" cy="110" r="44" fill="#16103a" />

        {/* Left ear outer / inner */}
        <polygon points="64,92 74,50 94,82"  fill="#16103a" />
        <polygon points="68,87 75,57 90,80"  fill="#3d1a5c" />

        {/* Right ear outer / inner */}
        <polygon points="156,92 146,50 126,82" fill="#16103a" />
        <polygon points="152,87 145,57 130,80" fill="#3d1a5c" />

        {/* Forehead crescent moon mark */}
        <path
          d="M104 82 Q110 73 117 76 Q110 80 108 88 Q102 85 104 82Z"
          fill="#d8bd70"
          opacity="0.94"
        />

        {/* ── Eyes ─────────────────────────────────── */}
        {/* Left */}
        <ellipse cx="92" cy="113" rx="13" ry="10" fill="url(#cfi-eye-l)" />
        <ellipse cx="92" cy="114" rx="5.5" ry="8"  fill="#060818" />
        <circle  cx="96" cy="109" r="2.8"           fill="white" opacity="0.88" />

        {/* Right */}
        <ellipse cx="128" cy="113" rx="13" ry="10" fill="url(#cfi-eye-r)" />
        <ellipse cx="128" cy="114" rx="5.5" ry="8"  fill="#060818" />
        <circle  cx="132" cy="109" r="2.8"           fill="white" opacity="0.88" />

        {/* ── Nose ─────────────────────────────────── */}
        <path d="M107 127 L110 131 L113 127 Q110 124 107 127Z" fill="#cbb8ff" opacity="0.88" />

        {/* ── Mouth ────────────────────────────────── */}
        <path
          d="M104 131 Q110 135 116 131"
          fill="none"
          stroke="#cbb8ff"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.68"
        />

        {/* ── Whiskers ─────────────────────────────── */}
        <line x1="72" y1="121" x2="100" y2="124" stroke="#cbb8ff" strokeWidth="1.2" opacity="0.52" />
        <line x1="70" y1="127" x2="100" y2="127" stroke="#cbb8ff" strokeWidth="1.2" opacity="0.42" />
        <line x1="74" y1="133" x2="100" y2="130" stroke="#cbb8ff" strokeWidth="1.2" opacity="0.32" />

        <line x1="148" y1="121" x2="120" y2="124" stroke="#cbb8ff" strokeWidth="1.2" opacity="0.52" />
        <line x1="150" y1="127" x2="120" y2="127" stroke="#cbb8ff" strokeWidth="1.2" opacity="0.42" />
        <line x1="146" y1="133" x2="120" y2="130" stroke="#cbb8ff" strokeWidth="1.2" opacity="0.32" />

        {/* ── Foreground sparkles ───────────────────── */}
        <text x="158" y="175" fill="#d8bd70" fontSize="11" opacity="0.68">✦</text>
        <circle cx="52" cy="168" r="2.4" fill="#8ef0dd" opacity="0.58" />
      </svg>
    </div>
  );
}
