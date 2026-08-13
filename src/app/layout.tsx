import type { Metadata } from "next";
import "uplot/dist/uPlot.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlightSentry — Spacecraft Incident Response",
  description:
    "AI mission assurance that detects spacecraft telemetry anomalies and explains operational context.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
