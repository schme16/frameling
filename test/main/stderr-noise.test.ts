// The one engine stderr line the Linux launcher drops, and nothing else. See src/main/stderrNoise.ts.
import { describe, expect, it } from 'vitest';
import { isHarmlessNssLine } from '../../src/main/stderrNoise';

const real = '[12345:1114/101500.123456:ERROR:crypto/nss_util.cc:382] After loading Root Certs, loaded==false: NSS error code: -8018';

describe('the harmless certificate store line', () => {
  it('matches the line as the engine writes it, with or without the lead and the newline', () => {
    expect(isHarmlessNssLine(real)).toBe(true);
    expect(isHarmlessNssLine(`${real}\n`)).toBe(true);
    expect(isHarmlessNssLine('ERROR:nss_util.cc:99] After loading Root Certs, loaded==false: NSS error code: -8018')).toBe(true);
  });
  it('does not match other errors, other NSS codes, or the line inside a longer one', () => {
    expect(isHarmlessNssLine('[1:2:ERROR:gpu_process_host.cc:1] GPU process exited unexpectedly')).toBe(false);
    expect(isHarmlessNssLine(real.replace('-8018', '-8000'))).toBe(false);
    expect(isHarmlessNssLine('[1:2:ERROR:crypto/nss_util.cc:382] Failed to load the certificate database')).toBe(false);
    expect(isHarmlessNssLine(`${real} and something else`)).toBe(false);
    expect(isHarmlessNssLine('')).toBe(false);
  });
});
