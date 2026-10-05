// A stand-in "camera frame" for demo mode (VITE_MOCK_LIVE=1), so design
// review shows the UI over something that looks like a repair scene:
// a ceiling fan seen from below with its motor housing and wiring.
// Boxes in mockLive.ts are positioned over this drawing. Demo only.

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 2000" preserveAspectRatio="xMidYMid slice">
<defs>
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cdbfa8"/><stop offset="1" stop-color="#8f7f69"/>
  </linearGradient>
  <radialGradient id="light" cx="0.5" cy="0.28" r="0.6">
    <stop offset="0" stop-color="#fff3d6" stop-opacity=".55"/><stop offset="1" stop-color="#fff3d6" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#5b5b5f"/><stop offset=".5" stop-color="#b9babf"/><stop offset="1" stop-color="#55565a"/>
  </linearGradient>
  <linearGradient id="blade" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6b4a2f"/><stop offset="1" stop-color="#8a6240"/>
  </linearGradient>
</defs>
<rect width="1000" height="2000" fill="url(#wall)"/>
<rect width="1000" height="2000" fill="url(#light)"/>
<g opacity=".18"><rect y="1500" width="1000" height="500" fill="#2a2018"/></g>
<g transform="translate(500 760)">
  <g fill="url(#blade)" stroke="#3d2a19" stroke-width="3">
    <path transform="rotate(-8)" d="M60 -34 L470 -58 Q510 -22 470 24 L60 34 Z"/>
    <path transform="rotate(112)" d="M60 -34 L470 -58 Q510 -22 470 24 L60 34 Z"/>
    <path transform="rotate(232)" d="M60 -34 L470 -58 Q510 -22 470 24 L60 34 Z"/>
  </g>
  <rect x="-18" y="-740" width="36" height="560" fill="url(#metal)"/>
  <ellipse cx="0" cy="0" rx="150" ry="150" fill="url(#metal)" stroke="#2f3033" stroke-width="4"/>
  <ellipse cx="0" cy="0" rx="104" ry="104" fill="#2b2c30" stroke="#17181a" stroke-width="3"/>
  <circle cx="0" cy="0" r="34" fill="#9c9ea4"/>
</g>
<g transform="translate(500 1100)">
  <rect x="-170" y="-90" width="340" height="190" rx="22" fill="#e4e2dc" stroke="#9b978c" stroke-width="4"/>
  <rect x="-120" y="-52" width="240" height="116" rx="58" fill="#2c4a6f"/>
  <text x="0" y="14" text-anchor="middle" font-family="sans-serif" font-size="38" font-weight="700" fill="#e8f0fa">2.5 uF 450V</text>
  <path d="M-60 100 C-70 190 -30 230 -50 330" stroke="#b3261e" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M0 100 C10 200 40 240 20 340" stroke="#1d1d1d" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M60 100 C80 190 50 250 90 330" stroke="#c9a227" stroke-width="12" fill="none" stroke-linecap="round"/>
</g>
</svg>`;

export const MOCK_SCENE_URI = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
