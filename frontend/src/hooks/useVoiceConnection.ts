/**
 * React hook wrapping VoiceConnection.
 *
 * Wires voice events to Zustand store and exposes connection lifecycle
 * and control methods for the voice pipeline.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  VoiceConnection,
  type ConnectionStatus,
  type MusicMessage,
} from "../audio/VoiceConnection";
import { useAppStore } from "../store";
import { useSelectionStore } from "../selectionStore";
import { musicService } from "../audio/MusicService";

export interface VoiceState {
  status: ConnectionStatus;
  transcripts: string[];
  guideTexts: string[];
  connect: () => void;
  disconnect: () => void;
  sendSessionStart: (timePeriod: { label: string; year: number }) => void;
  sendConfirmExploration: () => void;
  sendContext: (
    location: { lat: number; lng: number; name: string },
    timePeriod: { label: string; year: number },
  ) => void;
  sendPhase: (phase: string) => void;
  sendExploreStart: (data: {
    userProfile: string | null;
    worldDescription: string | null;
    location: { lat: number; lng: number; name: string } | null;
    timePeriod: { label: string; year: number };
  }) => void;
  sendFrame: (base64Jpeg: string) => void;
}

export function useVoiceConnection(): VoiceState {
  const vcRef = useRef<VoiceConnection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [guideTexts, setGuideTexts] = useState<string[]>([]);

  // Create the VoiceConnection instance once
  useEffect(() => {
    const vc = new VoiceConnection();
    vcRef.current = vc;

    // --- Core state listeners ---
    vc.on("status", (s: ConnectionStatus) => setStatus(s));
    vc.on("transcript", (text: string) => {
      setTranscripts((prev) => [...prev, text]);
      // Proactively send canvas frame on speech during exploring —
      // ensures backend has a recent frame by the time the turn fires.
      if (useAppStore.getState().phase === "exploring") {
        const captureFn = useAppStore.getState().captureWorldFrame;
        if (captureFn) {
          const frame = captureFn();
          if (frame) vc.sendFrame(frame);
        }
      }
    });
    vc.on("guideText", (text: string) => {
      setGuideTexts((prev) => [...prev, text]);
    });

    // --- Store-wired listeners ---
    vc.on("responseStart", () => {
      useAppStore.getState().clearGuideSubtitle();
    });

    // Word-level timestamps from TTS for synced subtitle reveal
    vc.on("wordTimestamp", (text: string, startS: number, stopS: number) => {
      useAppStore.getState().addWordTimestamp(text, startS, stopS);
    });

    // Mark when first audio chunk plays — starts the subtitle clock
    vc.on("audioPlaybackStart", () => {
      useAppStore.getState().markSubtitleAudioStart();
    });

    vc.on(
      "suggestedLocation",
      (lat: number, lng: number, name: string, year?: number) => {
        useAppStore.getState().setLocation({ lat, lng, name });
        if (year != null) {
          useSelectionStore.getState().setSelectedYear(year);
        }
      },
    );

    vc.on(
      "sessionSummary",
      (userProfile: string, worldDescription: string) => {
        useAppStore.getState().setSessionSummary(userProfile, worldDescription);
      },
    );

    // Mic level for waveform visualization (~20Hz updates)
    vc.on("micLevel", (rms: number) => {
      useAppStore.getState().setMicLevel(rms);
    });

    // AI-generated loading messages for the loading screen
    vc.on("loadingMessages", (messages: string[]) => {
      useAppStore.getState().setLoadingMessages(messages);
    });

    // Historical facts from Gemini generate_fact tool
    vc.on("fact", (text: string, category: string) => {
      useAppStore.getState().addFact({ text, category });
    });

    // Backend requests a canvas frame for Gemini visual context
    vc.on("requestFrame", () => {
      const captureFn = useAppStore.getState().captureWorldFrame;
      if (captureFn) {
        const frame = captureFn();
        if (frame) {
          vc.sendFrame(frame);
        }
      }
    });

    // Backend signals all confirm_exploration tool calls are done
    vc.on("transitionComplete", () => {
      useAppStore.getState().setTransitionComplete(true);
    });

    // Era-specific music from backend — ambient already faded out on confirm,
    // so just fade in the new track from silence. Wait for any TTS audio to
    // finish draining first so music doesn't cut off the AI mid-sentence.
    vc.on("music", (msg: MusicMessage) => {
      // Store explore track for later (plays when entering exploring phase)
      if (msg.exploreTrackUrl) {
        useAppStore.getState().setExploreTrack(msg.exploreTrackUrl);
        console.log(`[MUSIC] Queued explore track: ${msg.exploreTrackName ?? msg.exploreTrackUrl} by ${msg.exploreArtist ?? "unknown"}`);
      }
      if (msg.trackUrl) {
        const url = msg.trackUrl;
        const startMusic = () => {
          useAppStore.getState().setCurrentTrack(url);
          useAppStore.getState().setMusicPlaying(true);
          musicService.play(url, { loop: true, fadeInMs: 2000 });
          console.log(`[MUSIC] ${msg.source}: ${msg.trackName ?? url} by ${msg.artist ?? "unknown"}`);
        };
        // Poll until TTS playback finishes, then start music
        const waitForTTS = () => {
          if (vc.isTTSPlaying) {
            setTimeout(waitForTTS, 200);
          } else {
            startMusic();
          }
        };
        waitForTTS();
      }
    });

    return () => {
      vc.disconnect();
      vcRef.current = null;
    };
  }, []);

  const connect = useCallback(() => {
    void vcRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    vcRef.current?.disconnect();
    setTranscripts([]);
    setGuideTexts([]);
  }, []);

  const sendSessionStart = useCallback(
    (timePeriod: { label: string; year: number }) => {
      vcRef.current?.sendSessionStart(timePeriod);
    },
    [],
  );

  const sendConfirmExploration = useCallback(() => {
    vcRef.current?.sendConfirmExploration();
  }, []);

  const sendContext = useCallback(
    (
      location: { lat: number; lng: number; name: string },
      timePeriod: { label: string; year: number },
    ) => {
      vcRef.current?.sendContext(location, timePeriod);
    },
    [],
  );

  const sendPhase = useCallback((phase: string) => {
    vcRef.current?.sendPhase(phase);
  }, []);

  const sendExploreStart = useCallback(
    (data: {
      userProfile: string | null;
      worldDescription: string | null;
      location: { lat: number; lng: number; name: string } | null;
      timePeriod: { label: string; year: number };
    }) => {
      vcRef.current?.sendExploreStart(data);
    },
    [],
  );

  const sendFrame = useCallback((base64Jpeg: string) => {
    vcRef.current?.sendFrame(base64Jpeg);
  }, []);

  return {
    status,
    transcripts,
    guideTexts,
    connect,
    disconnect,
    sendSessionStart,
    sendConfirmExploration,
    sendContext,
    sendPhase,
    sendExploreStart,
    sendFrame,
  };
}
