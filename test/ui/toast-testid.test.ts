import { describe, expect, it } from 'vitest';
import { toastTestId } from '../../src/ui/toast';

describe('toast button test ids', () => {
  it('use the action id when there is one, else the label in lower case with dashes', () => {
    expect(toastTestId({ label: 'Restore', run: () => undefined, id: 'restore' })).toBe('toast.restore');
    expect(toastTestId({ label: 'Tell me more', run: () => undefined })).toBe('toast.tell-me-more');
    expect(toastTestId({ label: 'Save', run: () => undefined })).toBe('toast.save');
    expect(toastTestId({ label: '...', run: () => undefined })).toBe('toast.action');
  });
});
