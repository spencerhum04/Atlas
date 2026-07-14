import { useRef, useState, useEffect, useCallback } from 'react';
import { useSelectionStore } from '../selectionStore';
import EnterLocation from './EnterLocation';
import './TimeWheelSelector.css';

const MIN_YEAR = -3000;
const MAX_YEAR = 2026;
const CENTURY_TOAST_DURATION = 800;
const CENTURY_TOAST_COOLDOWN = 500;

interface Segment { yearStart: number; yearEnd: number; tStart: number; tEnd: number; }

const SEGMENTS: Segment[] = [
  { yearStart: -3000, yearEnd: -1000, tStart: 0,     tEnd: 1 / 6 },
  { yearStart: -1000, yearEnd: 0,     tStart: 1 / 6, tEnd: 2 / 6 },
  { yearStart: 0,     yearEnd: 500,   tStart: 2 / 6, tEnd: 3 / 6 },
  { yearStart: 500,   yearEnd: 1500,  tStart: 3 / 6, tEnd: 4 / 6 },
  { yearStart: 1500,  yearEnd: 1900,  tStart: 4 / 6, tEnd: 5 / 6 },
  { yearStart: 1900,  yearEnd: 2026,  tStart: 5 / 6, tEnd: 1 },
];

function positionToYear(t: number): number {
  t = Math.max(0, Math.min(1, t));
  for (const seg of SEGMENTS) {
    if (t <= seg.tEnd) {
      const frac = (t - seg.tStart) / (seg.tEnd - seg.tStart);
      let year = Math.round(seg.yearStart + frac * (seg.yearEnd - seg.yearStart));
      if (year === 0) year = frac >= 0.5 ? 1 : -1;
      return Math.max(MIN_YEAR, Math.min(MAX_YEAR, year));
    }
  }
  return MAX_YEAR;
}

function yearToPosition(year: number): number {
  for (const seg of SEGMENTS) {
    if (year <= seg.yearEnd || seg === SEGMENTS[SEGMENTS.length - 1]) {
      if (year < seg.yearStart) continue;
      const frac = (year - seg.yearStart) / (seg.yearEnd - seg.yearStart);
      return seg.tStart + frac * (seg.tEnd - seg.tStart);
    }
  }
  return 1;
}

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year} CE`;
}

function getCenturyLabel(year: number): string {
  if (year > 0) return `${Math.floor(year / 100) * 100}s`;
  const b = Math.abs(year);
  return `${Math.floor(b / 100) * 100}s BCE`;
}

interface TimeWheelSelectorProps {
  onEnterPress?: () => void;
}

export default function TimeWheelSelector({ onEnterPress }: TimeWheelSelectorProps) {
  const selectedYear = useSelectionStore((s) => s.selectedYear);
  const selectedEra = useSelectionStore((s) => s.selectedEra);
  const setSelectedYear = useSelectionStore((s) => s.setSelectedYear);

  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const lastCenturyRef = useRef(getCenturyLabel(selectedYear));
  const centuryToastTimerRef = useRef(0);
  const centuryCooldownRef = useRef(false);
  const [centuryToast, setCenturyToast] = useState<string | null>(null);

  const checkCenturyChange = useCallback((year: number) => {
    const century = getCenturyLabel(year);
    if (century !== lastCenturyRef.current) {
      lastCenturyRef.current = century;
      if (!centuryCooldownRef.current) {
        setCenturyToast(century);
        centuryCooldownRef.current = true;
        clearTimeout(centuryToastTimerRef.current);
        centuryToastTimerRef.current = window.setTimeout(() => {
          setCenturyToast(null);
          setTimeout(() => { centuryCooldownRef.current = false; }, CENTURY_TOAST_COOLDOWN);
        }, CENTURY_TOAST_DURATION);
      }
    }
  }, []);

  const updateFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const t = (clientX - rect.left) / rect.width;
    const year = positionToYear(t);
    setSelectedYear(year);
    checkCenturyChange(year);
  }, [setSelectedYear, checkCenturyChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateFromClientX(e.clientX);
  }, [updateFromClientX]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => { e.preventDefault(); updateFromClientX(e.clientX); };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, updateFromClientX]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    updateFromClientX(e.touches[0].clientX);
  }, [updateFromClientX]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: TouchEvent) => { e.preventDefault(); updateFromClientX(e.touches[0].clientX); };
    const onEnd = () => setIsDragging(false);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  }, [isDragging, updateFromClientX]);

  const position = yearToPosition(selectedYear);
  const percentStr = `${position * 100}%`;

  return (
    <div className="ts-container">
      <div className="ts-pills">
        <div className="ts-pill ts-pill--era">{selectedEra}</div>
        <div className="ts-pill ts-pill--year">{formatYear(selectedYear)}</div>
      </div>

      <div ref={trackRef} className="ts-track" onMouseDown={handleMouseDown} onTouchStart={handleTouchStart}>
        <div className="ts-fill" style={{ width: percentStr }} />
        <div className={`ts-thumb ${isDragging ? 'ts-thumb--active' : ''}`} style={{ left: percentStr }}>
          <div className="ts-thumb__filter" />
          <div className="ts-thumb__overlay" />
          <div className="ts-thumb__specular" />
        </div>
        {centuryToast && (
          <div key={centuryToast} className="ts-toast" style={{ left: percentStr }}>
            {centuryToast}
          </div>
        )}
      </div>

      <EnterLocation onEnterPress={onEnterPress} />
    </div>
  );
}
