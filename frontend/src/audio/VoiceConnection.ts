/**
 * WebSocket voice pipeline orchestrator.
 *
 * Framework-agnostic. Connects AudioCaptureService (mic → PCM) and
 * AudioPlaybackService (PCM → speaker) to the backend WebSocket at /ws/voice.
 *
 * Protocol (matches backend/routers/voice.py):
 *   Outbound: audio, context, phase, interrupt
 *   Inbound:  transcript, audio, guide_text, fact, world_status, music, suggested_location, interrupt
 */

import { AudioCaptureService } from "./AudioCaptureService";
import { AudioPlaybackService } from "./AudioPlaybackService";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type VoiceEventMap = {
  transcript: (text: string) => void;
  guideText: (text: string) => void;
  fact: (text: string, category: string) => void;
  worldStatus: (
    status: string,
    worldId?: string,
    splatUrl?: string,
  ) => void;
  music: (msg: MusicMessage) => void;
  suggestedLocation: (lat: number, lng: number, name: string, year?: number) => void;
  sessionSummary: (userProfile: string, worldDescription: string) => void;
  loadingMessages: (messages: string[]) => void;
  transitionComplete: () => void;
  wordTimestamp: (text: string, startS: number, stopS: number) => void;
  audioPlaybackStart: () => void;
  responseStart: () => void;
  status: (status: ConnectionStatus) => void;
  micLevel: (rms: number) => void;
  requestFrame: () => void;
};

export interface MusicMessage {
  source: "local" | "deezer";
  trackUrl?: string;
  trackName?: string;
  artist?: string;
  exploreTrackUrl?: string;
  exploreTrackName?: string;
  exploreArtist?: string;
}

type Listener = (...args: never[]) => void;

let audioChunksSent = 0;
let msgCount = 0;

export class VoiceConnection {
  private ws: WebSocket | null = null;
  private capture = new AudioCaptureService();
  private playback = new AudioPlaybackService();
  private listeners = new Map<string, Listener[]>();
  private _status: ConnectionStatus = "disconnected";
  /** Tracks the active backend response — audio from other responses is dropped. */
  private activeResponseId: string | null = null;
  private droppedAudioCount = 0;
  /** True until first audio chunk plays for current response (for subtitle sync). */
  private firstAudioForResponse = true;
  /** Mic mute state (currently always on — spacebar PTT removed). */
  private _muted = false;

  get status(): ConnectionStatus {
    return this._status;
  }

  /** Whether TTS audio is currently playing (buffered chunks still draining). */
  get isTTSPlaying(): boolean {
    return this.playback.isPlaying;
  }

  async connect(): Promise<void> {
    if (this.ws) return;

    audioChunksSent = 0;
    msgCount = 0;
    this.setStatus("connecting");

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/voice`;
    console.log("[VC] Connecting to:", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = async () => {
      console.log("[VC] WebSocket opened");
      this.playback.start();

      try {
        console.log("[VC] Starting mic capture...");
        await this.capture.start(
          (pcmBytes: ArrayBuffer) => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              audioChunksSent++;
              const base64 = arrayBufferToBase64(pcmBytes);
              if (audioChunksSent <= 3 || audioChunksSent % 100 === 0) {
                console.log(
                  `[VC→BE] Audio #${audioChunksSent}: ${pcmBytes.byteLength}B`,
                );
              }
              this.ws.send(JSON.stringify({ type: "audio", data: base64 }));
            }
          },
          undefined, // VAD not used for interrupt — speech-based interrupt via STT transcript
          (rms: number) => {
            // Pipe mic level to UI for waveform visualization
            this.emit("micLevel", rms);
          },
        );
        console.log("[VC] Mic capture started OK");
        this.setStatus("connected");
      } catch (err) {
        console.error("[VC] Mic capture failed:", err);
        this.setStatus("error");
        this.disconnect();
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<
          string,
          unknown
        >;
        this.handleMessage(msg);
      } catch (err) {
        console.error("[VC] Bad message:", err);
      }
    };

    this.ws.onclose = (event) => {
      console.log(
        `[VC] WebSocket closed: code=${event.code} reason="${event.reason}"`,
      );
      this.cleanup();
      this.setStatus("disconnected");
    };

    this.ws.onerror = (event) => {
      console.error("[VC] WebSocket error:", event);
      this.cleanup();
      this.setStatus("error");
    };
  }

  disconnect(): void {
    console.log("[VC] disconnect() called");
    if (this.ws) {
      // Null out handlers BEFORE closing to prevent the stale onclose from
      // destroying a new connection's AudioContext if connect() is called
      // immediately after disconnect() (e.g. globe → exploring phase transition).
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
    this.setStatus("disconnected");
  }

  sendContext(
    location: { lat: number; lng: number; name: string },
    timePeriod: { label: string; year: number },
  ): void {
    console.log("[VC→BE] sendContext:", { location, timePeriod });
    this.send({ type: "context", location, timePeriod });
  }

  sendPhase(phase: string): void {
    console.log("[VC→BE] sendPhase:", phase);
    this.send({ type: "phase", phase });
  }

  sendSessionStart(timePeriod: { label: string; year: number }): void {
    console.log("[VC→BE] sendSessionStart:", { timePeriod });
    this.send({ type: "session_start", timePeriod });
  }

  sendConfirmExploration(): void {
    console.log("[VC→BE] sendConfirmExploration");
    this.send({ type: "confirm_exploration" });
  }

  sendExploreStart(data: {
    userProfile: string | null;
    worldDescription: string | null;
    location: { lat: number; lng: number; name: string } | null;
    timePeriod: { label: string; year: number };
  }): void {
    console.log("[VC→BE] sendExploreStart:", data);
    this.send({ type: "explore_start", ...data });
  }

  sendFrame(base64Jpeg: string): void {
    this.send({ type: "frame", image: base64Jpeg });
  }

  on<K extends keyof VoiceEventMap>(
    event: K,
    listener: VoiceEventMap[K],
  ): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener as Listener);
    this.listeners.set(event, list);
  }

  off<K extends keyof VoiceEventMap>(
    event: K,
    listener: VoiceEventMap[K],
  ): void {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(listener as Listener);
    if (idx !== -1) list.splice(idx, 1);
  }

  // --- private ---

  private emit(event: string, ...args: unknown[]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const fn of list) {
      (fn as (...a: unknown[]) => void)(...args);
    }
  }

  private setStatus(status: ConnectionStatus): void {
    console.log(`[VC] Status: ${this._status} → ${status}`);
    this._status = status;
    this.emit("status", status);
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // Log non-audio outbound messages
      if (msg.type !== "audio") {
        console.log("[VC→BE] Send:", JSON.stringify(msg));
      }
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[VC→BE] DROPPED (ws not open):", msg.type);
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    msgCount++;

    switch (msg.type) {
      case "response_start":
        // New response starting — update active ID and clear any leftover playback
        this.activeResponseId = msg.responseId as string;
        this.droppedAudioCount = 0;
        this.firstAudioForResponse = true;
        console.log(
          `[BE→VC] #${msgCount} RESPONSE_START: ${this.activeResponseId}`,
        );
        this.emit("responseStart");
        break;

      case "transcript": {
        console.log(`[BE→VC] #${msgCount} TRANSCRIPT: "${msg.text}"`);
        // Clear stale subtitles when user speaks
        this.emit("responseStart");
        // Speech-based barge-in: interrupt playback if still active
        if (this.playback.isPlaying) {
          console.log(
            "[VC] TRANSCRIPT received while playback active → INTERRUPT",
          );
          this.playback.interrupt();
          this.activeResponseId = null; // Reject stale audio still in-flight
          this.send({ type: "interrupt" });
        }
        this.emit("transcript", msg.text as string);
        break;
      }

      case "audio": {
        // Drop audio from stale (cancelled) responses still in-flight
        if (msg.responseId && msg.responseId !== this.activeResponseId) {
          this.droppedAudioCount++;
          if (this.droppedAudioCount <= 3) {
            console.log(
              `[BE→VC] #${msgCount} AUDIO DROPPED (stale ${msg.responseId} != active ${this.activeResponseId})`,
            );
          }
          break;
        }
        const dataStr = msg.data as string;
        const pcm = base64ToArrayBuffer(dataStr);
        if (msgCount <= 5 || msgCount % 50 === 0) {
          console.log(
            `[BE→VC] #${msgCount} AUDIO: ${pcm.byteLength}B, playback.isPlaying=${this.playback.isPlaying}`,
          );
        }
        this.playback.playChunk(pcm);
        if (this.firstAudioForResponse) {
          this.firstAudioForResponse = false;
          this.emit("audioPlaybackStart");
        }
        break;
      }

      case "guide_text": {
        // Drop guide text from stale responses too
        if (msg.responseId && msg.responseId !== this.activeResponseId) {
          break;
        }
        console.log(`[BE→VC] #${msgCount} GUIDE_TEXT: "${msg.text}"`);
        this.emit("guideText", msg.text as string);
        break;
      }

      case "fact":
        console.log(
          `[BE→VC] #${msgCount} FACT: "${msg.text}" (${msg.category})`,
        );
        this.emit("fact", msg.text as string, msg.category as string);
        break;

      case "world_status":
        console.log(
          `[BE→VC] #${msgCount} WORLD_STATUS: ${msg.status}`,
          msg.worldId ? `id=${msg.worldId}` : "",
        );
        this.emit(
          "worldStatus",
          msg.status as string,
          msg.worldId as string | undefined,
          msg.splatUrl as string | undefined,
        );
        break;

      case "music": {
        const source = (msg.source as string) || "local";
        console.log(`[BE→VC] #${msgCount} MUSIC: source=${source} trackUrl=${msg.trackUrl}`);
        this.emit("music", {
          source: source as "local" | "deezer",
          trackUrl: msg.trackUrl as string | undefined,
          trackName: msg.trackName as string | undefined,
          artist: msg.artist as string | undefined,
          exploreTrackUrl: msg.exploreTrackUrl as string | undefined,
          exploreTrackName: msg.exploreTrackName as string | undefined,
          exploreArtist: msg.exploreArtist as string | undefined,
        });
        break;
      }

      case "suggested_location":
        console.log(
          `[BE→VC] #${msgCount} SUGGESTED_LOCATION: ${msg.name} (${msg.lat}, ${msg.lng})${msg.year != null ? ` year=${msg.year}` : ""}`,
        );
        this.emit(
          "suggestedLocation",
          msg.lat as number,
          msg.lng as number,
          msg.name as string,
          msg.year as number | undefined,
        );
        break;

      case "session_summary":
        console.log(
          `[BE→VC] #${msgCount} SESSION_SUMMARY received`,
        );
        this.emit(
          "sessionSummary",
          msg.userProfile as string,
          msg.worldDescription as string,
        );
        break;

      case "loading_messages":
        console.log(
          `[BE→VC] #${msgCount} LOADING_MESSAGES: ${(msg.messages as string[]).length} messages`,
        );
        this.emit("loadingMessages", msg.messages as string[]);
        break;

      case "transition_complete":
        console.log(`[BE→VC] #${msgCount} TRANSITION_COMPLETE`);
        this.emit("transitionComplete");
        break;

      case "word_timestamp": {
        if (msg.responseId && msg.responseId !== this.activeResponseId) break;
        this.emit(
          "wordTimestamp",
          msg.text as string,
          msg.startS as number,
          msg.stopS as number,
        );
        break;
      }

      case "request_frame":
        console.log(`[BE→VC] #${msgCount} REQUEST_FRAME`);
        this.emit("requestFrame");
        break;

      case "interrupt":
        console.log(
          `[BE→VC] #${msgCount} INTERRUPT from backend — stopping playback`,
        );
        this.playback.interrupt();
        this.activeResponseId = null; // Reject stale audio still in-flight
        break;

      default:
        console.log(`[BE→VC] #${msgCount} UNKNOWN: type=${msg.type}`, msg);
    }
  }

  private cleanup(): void {
    console.log(
      `[VC] cleanup: ${audioChunksSent} audio chunks sent, ${msgCount} msgs received`,
    );
    this.capture.stop();
    this.playback.stop();
    this.activeResponseId = null;
    this.ws = null;
  }
}

// --- base64 helpers ---

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
