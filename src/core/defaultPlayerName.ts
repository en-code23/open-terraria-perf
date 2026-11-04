// Fork: Ersatzname, wenn ein Charakter keinen Namen hat (statt fest „玩家“).
// Mit Zufallszahl, damit zwei namenlose Spieler auf demselben Server nicht
// wegen gleichen Namens abgewiesen werden.
import { Lang } from '../i18n/Lang';

let cached = '';
export function defaultPlayerName(): string {
  if (!cached) {
    const lang = Lang.activeCultureName ?? '';
    const base = lang.startsWith('de') ? 'Spieler' : lang.startsWith('zh') ? '玩家' : 'Player';
    cached = `${base}${100 + Math.floor(Math.random() * 900)}`;
  }
  return cached;
}
