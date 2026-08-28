import { ImageResponse } from "next/og";

export const dynamic = "force-static";

// Source-owned illustration: generated during the build, never from title input.
export function GET() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#192b24",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          border: "2px solid #6b8162",
          borderRadius: "50%",
          left: -320,
          top: -480,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 780,
          height: 780,
          border: "2px solid #6b8162",
          borderRadius: "50%",
          right: -160,
          bottom: -460,
        }}
      />
      <div
        style={{
          width: 460,
          height: 460,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #e8f7b8, #9ebd54)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 30,
          background: "#192b24",
          transform: "rotate(-35deg)",
        }}
      />
    </div>,
    {
      width: 1280,
      height: 800,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
