/**
 * Usuario actual (nombre con el que la IA lo identifica en el chat).
 *
 * Se guarda en sessionStorage (uno por pestaña, así se pueden probar varios
 * usuarios en el mismo navegador) y en localStorage solo para recordar el
 * último nombre y precargarlo en el login.
 */
const SESSION_KEY = 'umlboard.userName';
const LAST_KEY = 'umlboard.lastUserName';

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const normalizeUserName = (name: string) => name.trim().replace(/\s+/g, ' ').slice(0, 40);

export const getCurrentUserName = (): string | null =>
  safe(() => sessionStorage.getItem(SESSION_KEY), null);

export const getLastUserName = (): string =>
  safe(() => localStorage.getItem(LAST_KEY) || '', '');

export const setCurrentUserName = (name: string) => {
  const clean = normalizeUserName(name);
  safe(() => sessionStorage.setItem(SESSION_KEY, clean), undefined);
  safe(() => localStorage.setItem(LAST_KEY, clean), undefined);
};

export const clearCurrentUserName = () => {
  safe(() => sessionStorage.removeItem(SESSION_KEY), undefined);
};
