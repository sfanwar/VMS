import { useEffect, useRef } from 'react';

/**
 * Auto-logout after a period of user inactivity (OWASP A07 hardening — no
 * server-side idle timeout exists, so this bounds an unattended session well
 * below the 7-day refresh-token lifetime).
 *
 * Activity (mouse, keyboard, touch, scroll) resets the timer. Activity in one
 * browser tab resets the others via a shared localStorage timestamp.
 */
export function useIdleTimeout(onIdle: () => void, idleMinutes = 30) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    const idleMs = idleMinutes * 60 * 1000;
    const KEY = 'vms.lastActivity';

    const fireIfStillIdle = () => {
      let last = 0;
      try { last = parseInt(localStorage.getItem(KEY) ?? '0', 10) || 0; } catch { /* ignore */ }
      const elapsed = Date.now() - last;
      if (elapsed >= idleMs) {
        onIdleRef.current();
      } else {
        // Another tab saw activity more recently — reschedule for the remainder.
        schedule(idleMs - elapsed);
      }
    };

    const schedule = (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fireIfStillIdle, ms);
    };

    const markActivity = () => {
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
      schedule(idleMs);
    };

    // Reset when another tab records activity
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) schedule(idleMs);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));
    window.addEventListener('storage', onStorage);

    markActivity(); // start the clock

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActivity));
      window.removeEventListener('storage', onStorage);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idleMinutes]);
}
