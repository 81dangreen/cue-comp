import { APP_NAME } from "@/lib/brand";

// Web app manifest for the table tablet page, so it can be installed full screen
// ("Add to Home Screen") and opens straight to the scoreboard.
export function GET() {
  return Response.json(
    {
      name: `${APP_NAME} table scoreboard`,
      short_name: "Scoreboard",
      start_url: "/table",
      scope: "/table",
      display: "fullscreen",
      orientation: "any",
      background_color: "#0a2a1f",
      theme_color: "#0a2a1f",
      icons: [{ src: "/table-icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
