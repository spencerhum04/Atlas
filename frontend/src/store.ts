import { create } from 'zustand';

export interface LocationData {
  lat: number;
  lng: number;
  name: string;
}

export interface TimePeriodData {
  year: number;
  era: string;
  label: string;
}

export interface WorldRenderableAssets {
  spzUrls: Record<string, string>;
  defaultSpzUrl: string | null;
  colliderMeshUrl: string | null;
  panoUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  worldMarbleUrl: string | null;
}

export type TileMode = 'dark' | 'voyager';

interface AppState {
  phase: 'landing' | 'globe' | 'loading' | 'exploring';
  setPhase: (phase: AppState['phase']) => void;

  tileMode: TileMode;
  setTileMode: (mode: TileMode) => void;

  showLabels: boolean;
  setShowLabels: (v: boolean) => void;

  location: LocationData | null;
  timePeriod: TimePeriodData | null;
  setLocation: (loc: LocationData | null) => void;
  setTimePeriod: (tp: TimePeriodData | null) => void;

  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  setListening: (v: boolean) => void;
  setSpeaking: (v: boolean) => void;
  setTranscript: (t: string) => void;

  worldStatus: 'idle' | 'generating' | 'ready' | 'error';
  worldId: string | null;
  splatUrl: string | null;
  worldAssets: WorldRenderableAssets | null;
  setWorldStatus: (s: AppState['worldStatus']) => void;
  setWorldData: (id: string, url: string) => void;
  setRenderableWorldData: (id: string, assets: WorldRenderableAssets) => void;

  currentTrack: string | null;
  exploreTrack: string | null;
  isMusicPlaying: boolean;
  setCurrentTrack: (t: string | null) => void;
  setExploreTrack: (t: string | null) => void;
  setMusicPlaying: (v: boolean) => void;

  messages: Array<{ role: 'user' | 'guide'; text: string }>;
  addMessage: (msg: { role: 'user' | 'guide'; text: string }) => void;

  facts: Array<{ text: string; category: string; visible: boolean }>;
  addFact: (f: { text: string; category: string }) => void;

  // Session summary from Phase 1 voice conversation
  userProfile: string | null;
  worldDescription: string | null;
  setSessionSummary: (userProfile: string, worldDescription: string) => void;

  // Guide subtitle (word-by-word reveal synced to TTS word timestamps)
  guideSubtitle: string;
  _wordTimestamps: Array<{ text: string; startS: number; stopS: number }>;
  _subtitleAudioStart: number;
  addWordTimestamp: (text: string, startS: number, stopS: number) => void;
  markSubtitleAudioStart: () => void;
  clearGuideSubtitle: () => void;

  // Mic level for waveform visualization
  micLevel: number;
  isUserSpeaking: boolean;
  setMicLevel: (rms: number) => void;

  // AI-generated loading messages (from generate_loading_messages tool call)
  loadingMessages: string[];
  setLoadingMessages: (messages: string[]) => void;

  // Transition complete signal (backend finished goodbye + all tool calls)
  transitionComplete: boolean;
  setTransitionComplete: (v: boolean) => void;

  // Confirm exploration flow
  confirmExplorationRequested: boolean;
  requestConfirmExploration: () => void;
  clearConfirmExploration: () => void;

  // Canvas frame capture (set by WorldExplorer, called by App for visual queries)
  captureWorldFrame: (() => string | null) | null;
  setCaptureWorldFrame: (fn: (() => string | null) | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  phase: 'landing',
  setPhase: (phase) => set({ phase }),

  tileMode: 'voyager',
  setTileMode: (tileMode) => set({ tileMode }),

  showLabels: true,
  setShowLabels: (showLabels) => set({ showLabels }),

  location: null,
  timePeriod: null,
  setLocation: (location) => set({ location }),
  setTimePeriod: (timePeriod) => set({ timePeriod }),

  isListening: false,
  isSpeaking: false,
  transcript: '',
  setListening: (isListening) => set({ isListening }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setTranscript: (transcript) => set({ transcript }),

  worldStatus: 'idle',
  worldId: null,
  splatUrl: null,
  worldAssets: null,
  setWorldStatus: (worldStatus) => set({ worldStatus }),
  setWorldData: (worldId, splatUrl) =>
    set({
      worldId,
      splatUrl,
      worldStatus: 'ready',
      worldAssets: {
        spzUrls: splatUrl ? { selected: splatUrl } : {},
        defaultSpzUrl: splatUrl,
        colliderMeshUrl: null,
        panoUrl: null,
        thumbnailUrl: null,
        caption: null,
        worldMarbleUrl: null,
      },
    }),
  setRenderableWorldData: (worldId, assets) =>
    set({
      worldId,
      splatUrl: assets.defaultSpzUrl,
      worldAssets: assets,
      worldStatus: 'ready',
    }),

  currentTrack: null,
  exploreTrack: null,
  isMusicPlaying: false,
  setCurrentTrack: (currentTrack) => set({ currentTrack }),
  setExploreTrack: (exploreTrack) => set({ exploreTrack }),
  setMusicPlaying: (isMusicPlaying) => set({ isMusicPlaying }),

  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  facts: [],
  addFact: (f) =>
    set((s) => ({ facts: [...s.facts, { ...f, visible: true }] })),

  userProfile: null,
  worldDescription: null,
  setSessionSummary: (userProfile, worldDescription) => set({ userProfile, worldDescription }),

  guideSubtitle: '',
  _wordTimestamps: [],
  _subtitleAudioStart: 0,
  addWordTimestamp: (text, startS, stopS) =>
    set((s) => ({
      _wordTimestamps: [...s._wordTimestamps, { text, startS, stopS }],
    })),
  markSubtitleAudioStart: () => set({ _subtitleAudioStart: performance.now() }),
  clearGuideSubtitle: () => set({ guideSubtitle: '', _wordTimestamps: [], _subtitleAudioStart: 0 }),

  micLevel: 0,
  isUserSpeaking: false,
  setMicLevel: (rms) => set({ micLevel: rms, isUserSpeaking: rms > 0.02 }),

  loadingMessages: [],
  setLoadingMessages: (loadingMessages) => set({ loadingMessages }),

  transitionComplete: false,
  setTransitionComplete: (transitionComplete) => set({ transitionComplete }),

  confirmExplorationRequested: false,
  requestConfirmExploration: () => set({ confirmExplorationRequested: true }),
  clearConfirmExploration: () => set({ confirmExplorationRequested: false }),

  captureWorldFrame: null,
  setCaptureWorldFrame: (fn) => set({ captureWorldFrame: fn }),
}));
