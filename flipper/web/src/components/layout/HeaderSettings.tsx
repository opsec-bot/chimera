import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HeaderSettings() {
  const [open, setOpen] = React.useState(false);
  const [dataNotificationsEnabled, setDataNotificationsEnabled] = React.useState<boolean>(true);
  const [soundVolume, setSoundVolume] = React.useState<number>(100);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('dataNotificationsEnabled');
      setDataNotificationsEnabled(saved === null ? true : saved === 'true');
      const savedVol = localStorage.getItem('soundNotificationsVolume');
      if (savedVol) setSoundVolume(Math.round(parseFloat(savedVol) * 100));
    } catch (e) {
      // ignore
    }
  }, []);

  function toggleDataNotifications() {
    const v = !dataNotificationsEnabled;
    setDataNotificationsEnabled(v);
    localStorage.setItem('dataNotificationsEnabled', String(v));
    if ((window as any).soundNotifications)
      (window as any).soundNotifications.setSoundPreference(v);
  }

  function updateVolume(v: number) {
    const vol = Math.max(0, Math.min(100, v));
    setSoundVolume(vol);
    localStorage.setItem('soundNotificationsVolume', String(Math.max(0, Math.min(1, vol / 100))));
    if ((window as any).soundNotifications) (window as any).soundNotifications.setVolume(vol / 100);
  }

  function testDataSound() {
    if ((window as any).soundNotifications) {
      (window as any).soundNotifications.testSound &&
        (window as any).soundNotifications.testSound('dataReceived');
    }
  }

  function openFullSettings() {
    try {
      // tell dashboard to open settings on next load
      localStorage.setItem('openSettingsOnDashboard', '1');
      window.location.href = '/dashboard';
    } catch (e) {}
  }

  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!ref.current) return;
      const clicked = (t as Element | null)?.closest?.('[aria-label="settings"]');
      if (clicked) return;
      if (t && !ref.current.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="settings"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center p-2 rounded-md hover:bg-secondary"
      >
        <SettingsIcon className="h-5 w-5" />
      </button>

      <div
        className={cn(
          'fixed right-20 top-16 mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-50 transition-opacity origin-top-right',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ transformOrigin: 'top right' }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Settings</div>
            <button onClick={openFullSettings} className="text-sm text-primary hover:underline">
              Open full
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">Data sounds</div>
              <button
                onClick={toggleDataNotifications}
                className={cn(
                  'px-2 py-1 rounded text-sm',
                  dataNotificationsEnabled ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                )}
              >
                {dataNotificationsEnabled ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-sm">Volume</div>
              <input
                type="range"
                min={0}
                max={100}
                value={soundVolume}
                onChange={(e) => updateVolume(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={testDataSound}
                className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm"
              >
                Test
              </button>
              <button onClick={openFullSettings} className="px-3 py-1 border rounded text-sm">
                Open full
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
