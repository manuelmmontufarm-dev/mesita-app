import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const GREEN = "#2fb37e";
const DARK = "#1b1714";
const BG = "#F1EFEA";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
          borderRadius: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            width: 108,
            height: 108,
            gap: 10,
          }}
        >
          <div
            style={{
              width: 49,
              height: 49,
              background: GREEN,
              borderRadius: 14,
            }}
          />
          <div
            style={{
              width: 49,
              height: 49,
              background: DARK,
              borderRadius: 14,
            }}
          />
          <div
            style={{
              width: 49,
              height: 49,
              background: DARK,
              borderRadius: 14,
            }}
          />
          <div
            style={{
              width: 49,
              height: 49,
              background: GREEN,
              borderRadius: 14,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
