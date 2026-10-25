import { ImageResponse } from "next/og";
import { LOGO } from "@/components/logo";

// App icon for tablets that install the scoreboard to their home screen.
export function GET() {
  const { shaft, ferrule, tip, ball, stripe, spot, tilt, colors } = LOGO;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c3a2c" }}>
        <svg viewBox="-5 -5 46 46" width="512" height="512">
          <polygon points={shaft} fill={colors.shaft} />
          <polygon points={ferrule} fill={colors.ferrule} />
          <polygon points={tip} fill={colors.tip} />
          <circle cx={ball.cx} cy={ball.cy} r={ball.r} fill={colors.ball} />
          <g transform={tilt}>
            <path d={stripe} fill={colors.stripe} />
            <circle cx={spot.cx} cy={spot.cy} r={spot.r} fill={colors.ball} />
          </g>
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
