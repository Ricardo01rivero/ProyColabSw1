// Usuario actual (solo nombre). La IA del chat lo usa para saber quién pregunta.
// Se guarda en localStorage: sobrevive a recargas y no hay autenticación real.

const CURRENT_KEY = 'uml-board:currentUserName';
const LAST_KEY = 'uml-board:lastUserName';

const read = (key: string): string => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // almacenamiento no disponible: se ignora
  }
};

/** Limpia espacios repetidos y recorta el nombre (máx. 40 caracteres). */
export const normalizeUserName = (name: string): string =>
  name.replace(/\s+/g, ' ').trim().slice(0, 40);

export const getCurrentUserName = (): string => read(CURRENT_KEY);

export const setCurrentUserName = (name: string): void => {
  const clean = normalizeUserName(name);
  write(CURRENT_KEY, clean);
  write(LAST_KEY, clean);
};

/** Cierra sesión; recuerda el último nombre para sugerirlo en el login. */
export const clearCurrentUserName = (): void => {
  try {
    localStorage.removeItem(CURRENT_KEY);
  } catch {
    // se ignora
  }
};

export const getLastUserName = (): string => read(LAST_KEY);
