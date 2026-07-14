/**
 * Minimal test UI for the voice pipeline.
 *
 * One button to connect/disconnect. Displays:
 * - Connection status
 * - STT transcripts (what the mic heard)
 * - Guide text (what Gemini said)
 */

import { useVoiceConnection } from "./hooks/useVoiceConnection";

export default function App() {
  const { status, transcripts, guideTexts, connect, disconnect } =
    useVoiceConnection();

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>
        Voice Pipeline Test
      </h1>

      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={isConnected ? disconnect : connect}
          disabled={isConnecting}
          style={{
            padding: "0.6rem 1.5rem",
            fontSize: "1rem",
            cursor: isConnecting ? "wait" : "pointer",
          }}
        >
          {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Connect"}
        </button>
        <span style={{ marginLeft: "1rem" }}>
          Status: <strong>{status}</strong>
        </span>
      </div>

      <div style={{ display: "flex", gap: "1.5rem" }}>
        <LogPanel title="Transcripts (STT)" items={transcripts} />
        <LogPanel title="Guide (Gemini → TTS)" items={guideTexts} />
      </div>
    </div>
  );
}

function LogPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ flex: 1 }}>
      <h3 style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>{title}</h3>
      <div
        style={{
          height: 300,
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: "0.5rem",
          fontSize: "0.85rem",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          background: "#f9f9f9",
        }}
      >
        {items.length === 0
          ? "(nothing yet)"
          : items.map((text, i) => (
              <div key={i} style={{ marginBottom: "0.3rem" }}>
                {text}
              </div>
            ))}
      </div>
    </div>
  );
}
