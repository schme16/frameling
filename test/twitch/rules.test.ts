import { describe, expect, it } from 'vitest';
import { cleanKinds, coveredKinds, DEFAULT_KINDS, isTwitchApprovalAddress, KIND_INFO, KINDS, normaliseNotice, scopesFor } from '../../src/shared/twitch';
import { cleanRules, matchRules, MAX_RULES, newRule, payloadFor, sampleEvent, starterRules, type TwitchRule } from '../../src/twitch/rules';

const rule = (p: Partial<TwitchRule>): TwitchRule => ({ id: 'a', event: 'redemption', action: 'quill.cheer', on: true, ...p });

describe('permissions', () => {
  it('asks for the least: one per ticked kind, none for raids, no repeats, sorted', () => {
    expect(scopesFor(['raid'])).toEqual([]);
    expect(scopesFor(['redemption', 'raid'])).toEqual(['channel:read:redemptions']);
    expect(scopesFor(KINDS)).toEqual(['bits:read', 'channel:read:redemptions', 'channel:read:subscriptions', 'moderator:read:followers']);
    expect(scopesFor([])).toEqual([]);
  });
  it('every kind says in plain words what its permission is for, with no em dashes', () => {
    for (const k of KINDS) {
      expect(KIND_INFO[k].why.length).toBeGreaterThan(20);
      expect(KIND_INFO[k].label + KIND_INFO[k].why).not.toContain('—');
    }
  });
  it('starts with rewards and raids ticked, and cleans what it is given', () => {
    expect(DEFAULT_KINDS).toEqual(['redemption', 'raid']);
    expect(cleanKinds(['raid', 'nonsense', 'cheer', 'raid', 3])).toEqual(['cheer', 'raid']);
    expect(cleanKinds('x')).toEqual([]);
    expect(coveredKinds(['redemption', 'cheer', 'raid'], ['bits:read'])).toEqual(['cheer', 'raid']);
  });
  it('opens an approval page only on Twitch, over https, with no sneaky login part', () => {
    expect(isTwitchApprovalAddress('https://www.twitch.tv/activate?device-code=X')).toBe(true);
    expect(isTwitchApprovalAddress('http://www.twitch.tv/activate')).toBe(false);
    expect(isTwitchApprovalAddress('https://twitch.tv.evil.example/activate')).toBe(false);
    expect(isTwitchApprovalAddress('https://user:pw@www.twitch.tv/a')).toBe(false);
    expect(isTwitchApprovalAddress('javascript:alert(1)')).toBe(false);
    expect(isTwitchApprovalAddress('file:///etc/passwd')).toBe(false);
  });
});

describe('reading a Twitch notice', () => {
  it('keeps only what a link needs', () => {
    expect(normaliseNotice('channel.cheer', { bits: 12.9, user_name: 'x', message: 'y' })).toEqual({ kind: 'cheer', bits: 12 });
    expect(normaliseNotice('channel.raid', { viewers: -5 })).toEqual({ kind: 'raid', viewers: 0 });
    expect(normaliseNotice('channel.channel_points_custom_reward_redemption.add', { reward: { id: 'r', title: 't' } })).toEqual({ kind: 'redemption', rewardId: 'r', rewardTitle: 't' });
  });
  it('ignores a type it does not use, and a redemption with no reward', () => {
    expect(normaliseNotice('channel.chat.message', { message: { text: 'hi' }, chatter_user_name: 'n' })).toBeNull();
    expect(normaliseNotice('channel.channel_points_custom_reward_redemption.add', {})).toBeNull();
    expect(normaliseNotice('channel.cheer', 'junk')).toEqual({ kind: 'cheer', bits: 0 });
  });
});

describe('links', () => {
  it('matches by kind, and a reward link by its reward', () => {
    const rs = [rule({ id: '1' }), rule({ id: '2', rewardId: 'rw1' }), rule({ id: '3', rewardId: 'rw2' }), rule({ id: '4', event: 'raid' })];
    expect(matchRules(rs, { kind: 'redemption', rewardId: 'rw1', rewardTitle: 'x' }).map((r) => r.id)).toEqual(['1', '2']);
    expect(matchRules(rs, { kind: 'follow' })).toEqual([]);
  });
  it('honours minimum bits and minimum raiders, and off', () => {
    const rs = [rule({ id: 'c', event: 'cheer', min: 500 }), rule({ id: 'r', event: 'raid', min: 10 }), rule({ id: 'x', event: 'cheer', on: false })];
    expect(matchRules(rs, { kind: 'cheer', bits: 499 })).toEqual([]);
    expect(matchRules(rs, { kind: 'cheer', bits: 500 }).map((r) => r.id)).toEqual(['c']);
    expect(matchRules(rs, { kind: 'raid', viewers: 9 })).toEqual([]);
    expect(matchRules(rs, { kind: 'raid', viewers: 10 }).map((r) => r.id)).toEqual(['r']);
  });
  it('sends the viewer\'s words only when the link says so, else the streamer\'s, else nothing', () => {
    const e = { kind: 'redemption', rewardId: 'r', rewardTitle: 't', text: 'viewer words' } as const;
    expect(payloadFor(rule({ text: 'mine' }), e)).toBe('mine');
    expect(payloadFor(rule({ text: 'mine', useViewerText: true }), e)).toBe('viewer words');
    expect(payloadFor(rule({ useViewerText: true }), { ...e, text: undefined })).toBeUndefined();
    expect(payloadFor(rule({}), e)).toBeUndefined();
  });
  it('makes a pretend event with only the link\'s own words', () => {
    expect(sampleEvent(rule({ text: 'hello' }))).toEqual({ kind: 'redemption', rewardId: 'sample', rewardTitle: 'A reward', text: 'hello' });
    expect(sampleEvent(rule({ event: 'cheer', min: 300 }))).toEqual({ kind: 'cheer', bits: 300 });
  });
  it('reads rules from storage, dropping what is broken and keeping the rest', () => {
    const out = cleanRules([
      { id: 'a', event: 'raid', action: 'quill.wave', min: 5.7, on: true },
      { id: 'b', event: 'nonsense', action: 'quill.wave' },
      { id: 'c', event: 'follow', action: 'NOT AN ID' },
      { id: 'a', event: 'follow', action: 'quill.hop', rewardId: 'ignored', useViewerText: true },
      'junk',
      null,
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: 'a', event: 'raid', action: 'quill.wave', min: 5, on: true });
    expect(out[1].id).not.toBe('a');
    expect(out[1].rewardId).toBeUndefined();
    expect(out[1].useViewerText).toBeUndefined();
    expect(cleanRules('x')).toEqual([]);
    expect(cleanRules(Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, event: 'follow', action: 'quill.hop' })))).toHaveLength(MAX_RULES);
  });
  it('starter links only point at actions that exist, and are small view-only Quill ones', () => {
    expect(starterRules(() => false)).toEqual([]);
    const all = starterRules(() => true);
    expect(all.map((r) => r.action).every((a) => a.startsWith('quill.'))).toBe(true);
    expect(new Set(all.map((r) => r.event)).size).toBe(5);
    expect(starterRules((id) => id === 'quill.wave').map((r) => r.event)).toEqual(['raid']);
  });
  it('makes new links with their own id', () => {
    expect(newRule('cheer', 'quill.snack').id).not.toBe(newRule('cheer', 'quill.snack').id);
  });
});
