import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export interface ModalStackItem {
  id: string;
  isOpen: boolean;
  close: () => void;
}

/**
 * Universal Mobile Back Button Handler for both Android PWA and Native Capacitor APK.
 * When any modal/drawer is open, pressing the Android back button or swiping back
 * closes the topmost modal instead of exiting the app.
 *
 * Programmatic closures (e.g. clicking 'X' or switching from Detail to Editor)
 * safely consume the history state without falsely closing the next modal.
 */
export function useMobileBackHandler(modals: ModalStackItem[]) {
  const modalsRef = useRef(modals);
  modalsRef.current = modals;

  // Track the number of modals currently pushed to browser history
  const historyPushedCountRef = useRef(0);
  // Counter for programmatic history pops to ignore in handlePopState
  const ignoreNextPopStateCountRef = useRef(0);

  // Serialize open states to only trigger effect when modal states actually change
  const modalStateKey = modals.map((m) => `${m.id}:${m.isOpen ? '1' : '0'}`).join(',');

  // 1. Browser History synchronization for PWA / Web
  useEffect(() => {
    const activeModals = modalsRef.current.filter((m) => m.isOpen);
    const activeCount = activeModals.length;

    if (activeCount > historyPushedCountRef.current) {
      // A new modal opened: push history state
      const diff = activeCount - historyPushedCountRef.current;
      for (let i = 0; i < diff; i++) {
        window.history.pushState(
          { modalOpen: true, index: historyPushedCountRef.current + i + 1 },
          ''
        );
      }
      historyPushedCountRef.current = activeCount;
    } else if (activeCount < historyPushedCountRef.current) {
      // A modal was closed via UI button (e.g. X button, Save button, or modal transition)
      // Pop the history state so browser back stays aligned
      const diff = historyPushedCountRef.current - activeCount;
      historyPushedCountRef.current = activeCount;
      ignoreNextPopStateCountRef.current += diff;
      try {
        window.history.go(-diff);
      } catch {
        // ignore
      }
    }
  }, [modalStateKey]);

  // 2. Listen to browser `popstate` (triggered by user pressing Android back gesture / browser back)
  useEffect(() => {
    const handlePopState = () => {
      // If this popstate was triggered by our own window.history.go(-diff), ignore it!
      if (ignoreNextPopStateCountRef.current > 0) {
        ignoreNextPopStateCountRef.current -= 1;
        return;
      }

      const openModals = modalsRef.current.filter((m) => m.isOpen);
      if (openModals.length > 0) {
        // User physically swiped/pressed back: close topmost modal
        const topModal = openModals[openModals.length - 1];
        historyPushedCountRef.current = Math.max(0, historyPushedCountRef.current - 1);
        topModal.close();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // 3. Listen to Native Capacitor Android Hardware Back Button (for APK build)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let lastBackPressTime = 0;

    const backListenerPromise = CapApp.addListener('backButton', () => {
      const openModals = modalsRef.current.filter((m) => m.isOpen);
      if (openModals.length > 0) {
        // Close topmost modal
        const topModal = openModals[openModals.length - 1];
        topModal.close();
      } else {
        // When on root view without modals: double tap to exit within 2 seconds
        const now = Date.now();
        if (now - lastBackPressTime < 2000) {
          CapApp.exitApp();
        } else {
          lastBackPressTime = now;
          alert('再次按下返回键退出便签应用');
        }
      }
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove());
    };
  }, []);
}
