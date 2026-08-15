/** Check if the app is already running as an installed PWA */
export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  // Check display-mode standalone (Chrome / Edge)
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Check iOS standalone mode
  if ((window.navigator as any).standalone === true) return true;
  return false;
}
