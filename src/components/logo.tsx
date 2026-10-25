// Cue Comp mark: a tapered cue lined up on a striped 9-ball, a moment before the shot.
const n = (v: number) => Number(v.toFixed(3));
const CX = 25.5;
const CY = 25.5;
const R = 8.5;
const BAND = 4; // half-height of the yellow stripe
const HALF = Math.sqrt(R * R - BAND * BAND);
const [TOP, BOTTOM, LEFT, RIGHT] = [n(CY - BAND), n(CY + BAND), n(CX - HALF), n(CX + HALF)];

// The cue lies on the line from BUTT towards the ball centre and stops GAP short of the ball.
const BUTT = { x: -7, y: -6 }; // off-canvas, so the cue reads as full length
const GAP = 3.2;
const len = Math.hypot(CX - BUTT.x, CY - BUTT.y);
const dir = { x: (CX - BUTT.x) / len, y: (CY - BUTT.y) / len };
const perp = { x: -dir.y, y: dir.x };
const along = (d: number) => ({ x: BUTT.x + dir.x * d, y: BUTT.y + dir.y * d });
const cueLen = len - R - GAP;
/** Quadrilateral from distance a to b along the cue, tapering from half-width wa to wb. */
const segment = (a: number, b: number, wa: number, wb: number) => {
  const [p, q] = [along(a), along(b)];
  return [
    [p.x + perp.x * wa, p.y + perp.y * wa],
    [q.x + perp.x * wb, q.y + perp.y * wb],
    [q.x - perp.x * wb, q.y - perp.y * wb],
    [p.x - perp.x * wa, p.y - perp.y * wa],
  ]
    .map(([x, y]) => `${n(x)},${n(y)}`)
    .join(" ");
};
const width = (d: number) => 1.6 - (1.6 - 0.7) * (d / cueLen); // half-width, butt → tip

export const LOGO = {
  shaft: segment(0, cueLen - 2, width(0), width(cueLen - 2)),
  ferrule: segment(cueLen - 2, cueLen - 0.8, width(cueLen - 2), width(cueLen - 0.8)),
  tip: segment(cueLen - 0.8, cueLen, width(cueLen - 0.8), width(cueLen)),
  ball: { cx: CX, cy: CY, r: R },
  // Stripe = the part of the ball between CY ± BAND, as a path so no clipPath ids are needed.
  stripe: `M${LEFT} ${TOP} L${RIGHT} ${TOP} A${R} ${R} 0 0 1 ${RIGHT} ${BOTTOM} L${LEFT} ${BOTTOM} A${R} ${R} 0 0 1 ${LEFT} ${TOP} Z`,
  spot: { cx: n(CX - 1), cy: CY, r: 2.5 },
  tilt: `rotate(-25 ${CX} ${CY})`,
  colors: { shaft: "#d9a35b", ferrule: "#f3efe6", tip: "#3b82f6", ball: "#ffffff", stripe: "#f5c518" },
};

export function LogoMark({ className }: { className?: string }) {
  const { shaft, ferrule, tip, ball, stripe, spot, tilt, colors } = LOGO;
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden>
      <polygon points={shaft} fill={colors.shaft} />
      <polygon points={ferrule} fill={colors.ferrule} />
      <polygon points={tip} fill={colors.tip} />
      <circle {...ball} fill={colors.ball} />
      <g transform={tilt}>
        <path d={stripe} fill={colors.stripe} />
        <circle {...spot} fill={colors.ball} />
      </g>
    </svg>
  );
}
