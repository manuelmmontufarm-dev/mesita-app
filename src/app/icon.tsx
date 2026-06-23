import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const GREEN = "#2fb37e";
const DARK = "#1b1714";
const BG = "#F1EFEA";

export default function Icon() {
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
          borderRadius: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            width: 22,
            height: 22,
            gap: 2,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              background: GREEN,
              borderRadius: 3,
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              background: DARK,
              borderRadius: 3,
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              background: DARK,
              borderRadius: 3,
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              background: GREEN,
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
