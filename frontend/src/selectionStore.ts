import { create } from 'zustand';

export function getEra(year: number): string {
  if (year <= -1200) return 'Early Civilizations';
  if (year <= -500) return 'Iron Age';
  if (year <= 500) return 'Classical Antiquity';
  if (year <= 1000) return 'Early Middle Ages';
  if (year <= 1500) return 'Late Middle Ages';
  if (year <= 1700) return 'Renaissance and Early Modern';
  if (year <= 1800) return 'Enlightenment';
  if (year <= 1914) return 'Industrial Age';
  if (year <= 1945) return 'World Wars';
  if (year <= 1991) return 'Cold War';
  return 'Contemporary';
}

export interface TimeMeta {
  year: number;
  era: string;
  precision: 'year';
  source: 'user';
}

interface SelectionState {
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedEra: string;
  setSelectedEra: (era: string) => void;
  selectedTimeMeta: TimeMeta;
  setSelectedTimeMeta: (meta: TimeMeta) => void;
}

const DEFAULT_YEAR = 2000;
const DEFAULT_ERA = getEra(DEFAULT_YEAR);

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedYear: DEFAULT_YEAR,
  selectedEra: DEFAULT_ERA,
  selectedTimeMeta: { year: DEFAULT_YEAR, era: DEFAULT_ERA, precision: 'year', source: 'user' },

  setSelectedYear: (year: number) => {
    const era = getEra(year);
    set({
      selectedYear: year,
      selectedEra: era,
      selectedTimeMeta: { year, era, precision: 'year', source: 'user' },
    });
  },

  setSelectedEra: (era: string) => set({ selectedEra: era }),

  setSelectedTimeMeta: (meta: TimeMeta) =>
    set({ selectedTimeMeta: meta, selectedYear: meta.year, selectedEra: meta.era }),
}));
