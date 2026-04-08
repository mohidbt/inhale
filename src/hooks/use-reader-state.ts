import { create } from "zustand";

interface ReaderState {
  currentPage: number;
  totalPages: number;
  zoom: number;
  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useReaderState = create<ReaderState>((set) => ({
  currentPage: 1,
  totalPages: 0,
  zoom: 1.0,
  setCurrentPage: (page) =>
    set((s) => ({
      currentPage: Math.max(1, Math.min(s.totalPages || 1, page)),
    })),
  setTotalPages: (total) => set({ totalPages: total }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3.0, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(3.0, s.zoom + 0.25) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.5, s.zoom - 0.25) })),
  resetZoom: () => set({ zoom: 1.0 }),
}));
