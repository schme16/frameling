// Where OBS's password is kept. It is a secret, so it never goes in the preferences (which are backed up to a plain
// settings file) and never goes back up to the page: the page only learns that there is one. It is kept encrypted with
// the computer's own key store (Electron's safeStorage: Keychain, DPAPI, or the Linux secret service). Where there is
// no real key store (a Linux desktop with no keyring uses a fixed key, which protects nothing) it is not written to disk
// at all: it lasts until Frameling closes. No electron import here, so tests can use it.

/** The part of Electron's safeStorage this needs. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(cipher: Buffer): string;
  /** Linux only: which key store is in use. "basic_text" means none, so nothing is really protected. */
  getSelectedStorageBackend?: () => string;
}

export interface SecretFile {
  read(): string | null;
  write(text: string): void;
  remove(): void;
}

/** True when the computer has a key store that really protects what is put in it. */
export function canKeepSecrets(safe: SafeStorageLike | null | undefined): boolean {
  if (!safe) return false;
  try {
    if (!safe.isEncryptionAvailable()) return false;
    const backend = safe.getSelectedStorageBackend?.();
    return backend !== 'basic_text' && backend !== 'unknown';
  } catch {
    return false;
  }
}

export class ObsSecret {
  private memory = '';

  constructor(
    private safe: SafeStorageLike | null | undefined,
    private file: SecretFile,
  ) {}

  /** Whether a password can be kept across restarts here. */
  get canSave(): boolean {
    return canKeepSecrets(this.safe);
  }

  /** The password to connect with: what was set this session, else the saved one, else none. */
  get(): string {
    if (this.memory) return this.memory;
    if (!this.canSave) return '';
    try {
      const raw = this.file.read();
      if (!raw) return '';
      const parsed = JSON.parse(raw) as { v?: number; password?: string };
      if (parsed.v !== 1 || typeof parsed.password !== 'string') return '';
      return this.safe!.decryptString(Buffer.from(parsed.password, 'base64'));
    } catch {
      return '';
    }
  }

  /** Whether there is a password at all, saved or for now. */
  has(): boolean {
    return this.get() !== '';
  }

  /** Keeps a password for this session, and on disk too when `remember` and the computer can do it safely. Returns whether it was saved to disk. */
  set(password: string, remember: boolean): boolean {
    this.memory = password;
    if (!password || !remember || !this.canSave) {
      this.file.remove();
      return false;
    }
    try {
      this.file.write(JSON.stringify({ v: 1, password: this.safe!.encryptString(password).toString('base64') }));
      return true;
    } catch {
      return false;
    }
  }

  /** Forgets it everywhere. */
  forget(): void {
    this.memory = '';
    this.file.remove();
  }
}
