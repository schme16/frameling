// Where the Twitch sign-in is kept. Same rules as OBS's password (obsSecret.ts): never in the preferences, never sent up
// to the page, encrypted with the computer's own key store, and held only in memory where there is no real key store
// (it then lasts until Frameling closes). No electron import here, so tests can use it.
import { canKeepSecrets, type SafeStorageLike, type SecretFile } from './obsSecret';
import type { Tokens } from './twitchAuth';

const valid = (t: unknown): t is Tokens => {
  const o = t as Partial<Tokens> | null;
  return !!o && typeof o.accessToken === 'string' && !!o.accessToken && typeof o.refreshToken === 'string' && !!o.refreshToken && typeof o.expiresAt === 'number' && Array.isArray(o.scopes) && typeof o.userId === 'string' && typeof o.login === 'string';
};

export class TwitchTokens {
  private memory: Tokens | null = null;
  private loaded = false;

  constructor(
    private safe: SafeStorageLike | null | undefined,
    private file: SecretFile,
  ) {}

  /** Whether a sign-in can be kept across restarts on this computer. */
  get canSave(): boolean {
    return canKeepSecrets(this.safe);
  }

  /** The sign-in: what was made this session, else the saved one, else none. */
  get(): Tokens | null {
    if (this.memory) return this.memory;
    if (this.loaded || !this.canSave) return null;
    this.loaded = true;
    try {
      const raw = this.file.read();
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { v?: number; sealed?: string };
      if (parsed.v !== 1 || typeof parsed.sealed !== 'string') return null;
      const t: unknown = JSON.parse(this.safe!.decryptString(Buffer.from(parsed.sealed, 'base64')));
      if (!valid(t)) return null;
      this.memory = t;
      return t;
    } catch {
      return null;
    }
  }

  /** Keeps it for this session, and on disk too where the computer has a real key store. Returns whether it reached the disk. */
  set(t: Tokens): boolean {
    this.memory = t;
    this.loaded = true;
    if (!this.canSave) {
      this.file.remove();
      return false;
    }
    try {
      this.file.write(JSON.stringify({ v: 1, sealed: this.safe!.encryptString(JSON.stringify(t)).toString('base64') }));
      return true;
    } catch {
      return false;
    }
  }

  /** Forgets it everywhere. */
  forget(): void {
    this.memory = null;
    this.loaded = true;
    this.file.remove();
  }
}
