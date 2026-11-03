// Fork: Entwickler-/Debug-Tasten nur mit Entwicklerschalter.
// Aktivieren: URL-Parameter ?dev=1 oder localStorage "sw-dev" = "1".
// (Probe-Skripte des Projekts laufen mit ?dev=1 weiter wie bisher.)
export const FORK_DEV_KEYS: boolean = (() => {
  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev')) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem('sw-dev') === '1';
  } catch {
    return false;
  }
})();
