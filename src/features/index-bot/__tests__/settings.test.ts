import { curvePaths, gridValues, signedDomain, yOf } from '@/features/index-bot/lib/chart';
import { DEFAULT_NUMBERS } from '@/features/index-bot/lib/normalize';
import {
  ALL_FIELDS,
  armWarning,
  canStartDeploy,
  deployCheck,
  draftFrom,
  isDirty,
  numberText,
  parseField,
  rangeText,
  rebaseDraft,
  RISK_FIELDS,
  sampleNote,
  serverFieldErrors,
  SIGNAL_FIELDS,
  validateDraft,
  type SettingField,
} from '@/features/index-bot/lib/settings';
import type { BotSettings } from '@/features/index-bot/types';

const saved: BotSettings = { ...DEFAULT_NUMBERS, enabled: false, mode: 'paper' };
const field = (key: SettingField['key']) => ALL_FIELDS.find((f) => f.key === key)!;

describe('fields mirror the server schema', () => {
  it('covers every numeric setting exactly once', () => {
    expect(ALL_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(DEFAULT_NUMBERS).sort());
    expect(RISK_FIELDS).toHaveLength(6);
    expect(SIGNAL_FIELDS).toHaveLength(8);
  });

  it('caps the stop loss at the server’s hard 10%', () => {
    const stop = field('maxStopLossPct');
    expect([stop.min, stop.max, stop.integer, stop.unit]).toEqual([5, 10, false, '%']);
    expect(rangeText(stop)).toBe('5–10');
    expect(parseField(stop, '7.5')).toEqual({ value: 7.5, error: null });
    expect(parseField(stop, '10')).toEqual({ value: 10, error: null });
    expect(parseField(stop, '10.5')).toEqual({ value: null, error: 'Between 5–10' });
    expect(parseField(stop, '4.9').error).toBe('Between 5–10');
    expect(parseField(stop, '15 %').error).toBe('Between 5–10');
    expect(DEFAULT_NUMBERS.maxStopLossPct).toBe(10);
  });

  it('sends the stop cap with every save — the server’s strict schema requires it', () => {
    const { body, errors } = validateDraft(draftFrom({ ...saved, maxStopLossPct: 8.5 }));
    expect(errors).toEqual({});
    expect(body?.maxStopLossPct).toBe(8.5);
    const bad = validateDraft({
      ...draftFrom(saved),
      texts: { ...draftFrom(saved).texts, maxStopLossPct: '12' },
    });
    expect(bad.body).toBeNull();
    expect(bad.errors.maxStopLossPct).toBe('Between 5–10');
  });

  it('defaults the cadence to the server’s 15 minutes', () => {
    expect(DEFAULT_NUMBERS.cadenceMinutes).toBe(15);
    expect(field('cadenceMinutes').label).toBe('Analysis cadence');
  });

  it('accepts every server default', () => {
    for (const f of ALL_FIELDS) {
      expect(parseField(f, numberText(DEFAULT_NUMBERS[f.key])).error).toBeNull();
    }
  });

  it('uses the zod ranges', () => {
    expect([field('cadenceMinutes').min, field('cadenceMinutes').max]).toEqual([5, 60]);
    expect([field('maxPremium').min, field('maxPremium').max]).toEqual([1_000, 100_000]);
    expect([field('maxDailyLoss').min, field('maxDailyLoss').max]).toEqual([100, 25_000]);
    expect([field('minProbabilityEdge').min, field('minProbabilityEdge').max]).toEqual([0, 0.25]);
    expect(field('minRewardRisk').integer).toBe(false);
    expect(field('maxLots').integer).toBe(true);
  });

  it('prints ranges grouped and unpadded', () => {
    expect(rangeText(field('maxPremium'))).toBe('1,000–1,00,000');
    expect(rangeText(field('minFutureMovePct'))).toBe('0.1–5');
    expect(rangeText(field('minProbabilityEdge'))).toBe('0–0.25');
    expect(rangeText(field('minRewardRisk'))).toBe('1.2–5');
  });
});

describe('parseField', () => {
  it('reads plain numbers, tolerating grouping and units', () => {
    expect(parseField(field('maxPremium'), '10,000')).toEqual({ value: 10_000, error: null });
    expect(parseField(field('maxPremium'), ' ₹25000 ')).toEqual({ value: 25_000, error: null });
    expect(parseField(field('minRewardRisk'), '1.5')).toEqual({ value: 1.5, error: null });
    expect(parseField(field('minProbabilityEdge'), '.05')).toEqual({ value: 0.05, error: null });
  });

  it('refuses what the server would refuse', () => {
    expect(parseField(field('maxLots'), '')).toEqual({ value: null, error: 'Required' });
    expect(parseField(field('maxLots'), 'abc').error).toBe('Enter a number');
    expect(parseField(field('maxLots'), '1e3').error).toBe('Enter a number');
    expect(parseField(field('maxLots'), '1.5').error).toBe('A whole number');
    expect(parseField(field('maxLots'), '6').error).toBe('Between 1–5');
    expect(parseField(field('minRewardRisk'), '1.1').error).toBe('Between 1.2–5');
    expect(parseField(field('minProbabilityEdge'), '-0.1').error).toBe('Between 0–0.25');
  });
});

describe('the draft', () => {
  it('starts from the saved settings and is clean', () => {
    const draft = draftFrom(saved);
    expect(draft.texts.minProbabilityEdge).toBe('0.05');
    expect(draft.texts.maxPremium).toBe('10000');
    expect(isDirty(draft, saved)).toBe(false);
  });

  it('is dirty when a value or the switch changes, not when only the text differs', () => {
    const draft = draftFrom(saved);
    expect(isDirty({ ...draft, enabled: true }, saved)).toBe(true);
    expect(isDirty({ ...draft, texts: { ...draft.texts, maxLots: '2' } }, saved)).toBe(true);
    expect(isDirty({ ...draft, texts: { ...draft.texts, maxPremium: '10,000' } }, saved)).toBe(
      false,
    );
    expect(isDirty({ ...draft, texts: { ...draft.texts, maxLots: '' } }, saved)).toBe(true);
  });

  it('validates into the exact strict body — never with `mode`', () => {
    const draft = { ...draftFrom(saved), enabled: true };
    const { errors, body } = validateDraft(draft);
    expect(errors).toEqual({});
    expect(body).toEqual({ ...DEFAULT_NUMBERS, enabled: true });
    expect(body).not.toHaveProperty('mode');

    const bad = validateDraft({
      ...draft,
      texts: { ...draft.texts, maxLots: '9', cadenceMinutes: '' },
    });
    expect(bad.body).toBeNull();
    expect(bad.errors).toEqual({ maxLots: 'Between 1–5', cadenceMinutes: 'Required' });
  });

  it('rebases untouched fields onto the server and keeps edited ones', () => {
    const draft = draftFrom(saved);
    const edited = { ...draft, texts: { ...draft.texts, maxLots: '3' } };
    const next: BotSettings = { ...saved, maxPremium: 20_000, maxLots: 2 };
    const rebased = rebaseDraft(edited, saved, next);
    expect(rebased.texts.maxPremium).toBe('20000');
    expect(rebased.texts.maxLots).toBe('3');
  });

  it('lets a stop made elsewhere win unless the switch was flipped here', () => {
    const armed: BotSettings = { ...saved, enabled: true };
    const draft = { ...draftFrom(armed), texts: { ...draftFrom(armed).texts, maxLots: '2' } };
    const stopped = rebaseDraft(draft, armed, { ...armed, enabled: false });
    expect(stopped.enabled).toBe(false);

    const flipped = rebaseDraft({ ...draftFrom(saved), enabled: true }, saved, {
      ...saved,
      maxLots: 2,
    });
    expect(flipped.enabled).toBe(true);
  });

  it('maps server field errors onto the fields', () => {
    expect(serverFieldErrors({ maxLots: 'Too big', other: 'x' })).toEqual({ maxLots: 'Too big' });
    expect(serverFieldErrors(undefined)).toEqual({});
  });
});

describe('arming', () => {
  it('warns only when saving turns the bot on', () => {
    expect(armWarning({ enabled: true }, { enabled: false }, 'paper')?.title).toBe(
      'Arm paper entries?',
    );
    expect(armWarning({ enabled: true }, { enabled: false }, 'live')?.title).toBe(
      'Arm live entries?',
    );
    expect(armWarning({ enabled: true }, { enabled: true }, 'live')).toBeNull();
    expect(armWarning({ enabled: false }, { enabled: true }, 'paper')).toBeNull();
  });
});

describe('deploy to live', () => {
  const ready = {
    mode: 'paper' as const,
    liveAvailable: true,
    aiConfigured: true,
    phrase: 'DEPLOY LIVE',
  };

  it('needs the exact phrase, compared as the server compares it', () => {
    expect(deployCheck({ ...ready, typed: 'DEPLOY LIVE' })).toEqual({ ok: true });
    expect(deployCheck({ ...ready, typed: '  deploy live ' })).toEqual({ ok: true });
    expect(deployCheck({ ...ready, typed: 'DEPLOY' })).toEqual({
      ok: false,
      reason: 'Type DEPLOY LIVE to confirm real Groww orders.',
    });
  });

  it('refuses when live is not available, AI is missing, already live or no phrase is known', () => {
    expect(deployCheck({ ...ready, mode: 'live', typed: 'DEPLOY LIVE' }).ok).toBe(false);
    expect(deployCheck({ ...ready, aiConfigured: false, typed: 'DEPLOY LIVE' })).toEqual({
      ok: false,
      reason: 'The AI service connection is not configured.',
    });
    const off = deployCheck({ ...ready, liveAvailable: false, typed: 'DEPLOY LIVE' });
    expect(off.ok).toBe(false);
    expect(!off.ok && off.reason).toMatch(/master switch/);
    expect(deployCheck({ ...ready, phrase: null, typed: '' }).ok).toBe(false);
  });

  it('refuses everything under the server’s paper-only lock', () => {
    expect(deployCheck({ ...ready, paperOnly: true, typed: 'DEPLOY LIVE' })).toEqual({
      ok: false,
      reason: 'Index trading is locked to paper trading on this server.',
    });
    expect(canStartDeploy({ ...ready, paperOnly: true }).ok).toBe(false);
    expect(canStartDeploy({ ...ready, paperOnly: false })).toEqual({ ok: true });
  });

  it('opens the flow when everything but the phrase is ready', () => {
    expect(canStartDeploy(ready)).toEqual({ ok: true });
    expect(canStartDeploy({ ...ready, liveAvailable: false }).ok).toBe(false);
    expect(canStartDeploy({ ...ready, phrase: null }).ok).toBe(false);
  });

  it('flags a small test sample', () => {
    expect(sampleNote(5)).toMatch(/small sample/);
    expect(sampleNote(25)).toBeNull();
  });
});

describe('the signed P&L curve', () => {
  it('always includes zero, rounded out to nice bounds', () => {
    expect(signedDomain([120, 860, 400])).toEqual({ lo: 0, hi: 1000 });
    expect(signedDomain([-300, -1200])).toEqual({ lo: -2000, hi: 0 });
    expect(signedDomain([-300, 700])).toEqual({ lo: -500, hi: 1000 });
    expect(signedDomain([0, 0])).toEqual({ lo: 0, hi: 1 });
    expect(signedDomain([])).toEqual({ lo: 0, hi: 1 });
  });

  it('maps values top-down and lists gridlines without repeats', () => {
    expect(yOf(1000, -1000, 1000, 100)).toBe(0);
    expect(yOf(0, -1000, 1000, 100)).toBe(50);
    expect(yOf(-1000, -1000, 1000, 100, 8)).toBe(108);
    expect(gridValues(-500, 1000)).toEqual([1000, 0, -500]);
    expect(gridValues(0, 1000)).toEqual([1000, 0]);
  });

  it('closes the area on the zero line', () => {
    const { line, area } = curvePaths([0, 500, -500], 100, 100, { lo: -1000, hi: 1000 });
    expect(line).toBe('M0.0 50.0 L50.0 25.0 L100.0 75.0');
    expect(area).toBe(`${line} L100.0 50.0 L0.0 50.0 Z`);
    expect(curvePaths([1], 100, 100, { lo: 0, hi: 1 })).toEqual({ line: '', area: '' });
  });
});
