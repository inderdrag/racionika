import { create } from 'zustand';
export type Tab = 'home' | 'diary' | 'coach' | 'progress' | 'settings';
export const useNavigation = create<{ tab: Tab; setTab: (tab: Tab) => void }>((set) => ({
  tab: 'home',
  setTab: (tab) => set({ tab }),
}));
