import { ImageResponse } from "next/og";
export const alt = "PRCUISA Hub — Satu PRCUISA ID. Banyak tools berguna.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#edf5f2",
        color: "#434242",
        padding: "70px",
        borderLeft: "18px solid #009AA5",
      }}
    >
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
        PRCUISA <span style={{ color: "#00737c", marginLeft: 18 }}>HUB</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 76,
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        <span>Satu PRCUISA ID.</span>
        <span style={{ color: "#00737c" }}>Banyak tools berguna.</span>
      </div>
      <div style={{ display: "flex", fontSize: 22 }}>
        One account. Smarter tools. Better business.
      </div>
    </div>,
    size,
  );
}
