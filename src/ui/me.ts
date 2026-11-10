const KEY = 'flake.me';

/** Who usually uses this phone, remembered on this device only, so purchases say who logged them. */
export function getMe(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setMe(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* private mode: just not remembered */
  }
}
