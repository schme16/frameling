// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/timeline';
import { mountQuestLayer } from '../../src/quests/QuestLayer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the guide layer', () => {
  it('goes on the page once, however often it is asked for', async () => {
    await act(async () => {
      mountQuestLayer();
      mountQuestLayer();
    });
    expect(document.querySelectorAll('#quests-root')).toHaveLength(1);
    expect(document.querySelector('#quests-root .qr')).toBeTruthy();
  });
});
