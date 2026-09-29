/* eslint-disable @typescript-eslint/no-require-imports -- expo-speech loads lazily, see below */
import { requireOptionalNativeModule } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

import { useFetchNarration } from './hooks';
import { fitTranscript, nextSpeed } from './lib/brief';
import type { DailyBriefRiskProfile } from './types';

type SpeechModule = typeof import('expo-speech');

/**
 * expo-speech looks its native module up the moment it's imported, so a development build
 * made before it was added would crash on this screen. Probe first and require it only when
 * the native side exists; without it the Listen controls say so instead of failing.
 */
let speechModule: SpeechModule | null | undefined;
function speech(): SpeechModule | null {
  if (speechModule === undefined) {
    speechModule =
      requireOptionalNativeModule('ExpoSpeech') !== null
        ? (require('expo-speech') as SpeechModule)
        : null;
  }
  return speechModule;
}

export type NarrationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'done';

export interface Narration {
  /** Whether this device can speak at all. */
  supported: boolean;
  status: NarrationStatus;
  /** Whether the player bar should be on screen. */
  open: boolean;
  transcript: string;
  /** 0…1 through the transcript. */
  progress: number;
  speed: number;
  start: () => void;
  toggle: () => void;
  cycleSpeed: () => void;
  close: () => void;
}

/**
 * Reads the brief aloud with the device's own speech engine — the server only supplies the
 * script (the web does the same with the browser's). Pause is implemented as stop-and-
 * remember-the-word, because Android has no native pause: resume, and every speed change,
 * restart from the last word reached, so both platforms behave the same. Speech stops when
 * the screen loses focus or unmounts. The caller closes the player before switching to a
 * different brief (date or risk profile), since each has its own script.
 */
export function useNarration(date: string, riskProfile: DailyBriefRiskProfile): Narration {
  const fetchNarration = useFetchNarration();
  const [status, setStatus] = useState<NarrationStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [open, setOpen] = useState(false);

  // Every utterance gets a token; callbacks from a superseded one are ignored.
  const token = useRef(0);
  const offset = useRef(0);
  const script = useRef('');

  const halt = useCallback(() => {
    token.current += 1;
    void speech()
      ?.stop()
      .catch(() => undefined);
  }, []);

  const speakFrom = useCallback((from: number, rate: number) => {
    const engine = speech();
    const text = script.current;
    if (!engine || !text) return;
    token.current += 1;
    const mine = token.current;
    offset.current = from;
    engine.speak(text.slice(from), {
      rate,
      language: 'en-IN',
      onBoundary: ({ charIndex }: { charIndex: number }) => {
        if (mine !== token.current) return;
        offset.current = from + charIndex;
        setProgress(Math.min(1, offset.current / Math.max(1, text.length)));
      },
      onDone: () => {
        if (mine !== token.current) return;
        offset.current = 0;
        setProgress(1);
        setStatus('done');
      },
      onError: () => {
        if (mine !== token.current) return;
        setStatus('paused');
        toast.error('Couldn’t play the brief', 'Your device’s speech engine reported an error.');
      },
    } as Parameters<SpeechModule['speak']>[1]);
    setStatus('playing');
  }, []);

  const start = useCallback(() => {
    const engine = speech();
    if (!engine) {
      toast.info('Listening isn’t available', 'Update to the latest app build to hear the brief.');
      return;
    }
    halt();
    setOpen(true);
    setStatus('loading');
    setProgress(0);
    const mine = token.current;
    fetchNarration(date, riskProfile)
      .then((audio) => {
        if (mine !== token.current) return;
        const text = fitTranscript(audio.transcript, engine.maxSpeechInputLength);
        if (!text) {
          setStatus('idle');
          setOpen(false);
          toast.info('Nothing to read yet', 'This brief has no narration script.');
          return;
        }
        script.current = text;
        setTranscript(text);
        speakFrom(0, speed);
      })
      .catch((error: unknown) => {
        if (mine !== token.current) return;
        setStatus('idle');
        setOpen(false);
        toast.error('Couldn’t prepare the brief', getErrorMessage(error));
      });
  }, [date, fetchNarration, halt, riskProfile, speakFrom, speed]);

  const toggle = useCallback(() => {
    if (status === 'playing') {
      halt();
      setStatus('paused');
    } else if (status === 'paused') {
      speakFrom(offset.current, speed);
    } else if (status === 'done' || (status === 'idle' && script.current)) {
      setProgress(0);
      speakFrom(0, speed);
    } else if (status === 'idle') {
      start();
    }
  }, [halt, speakFrom, speed, start, status]);

  const cycleSpeed = useCallback(() => {
    const next = nextSpeed(speed);
    setSpeed(next);
    if (status === 'playing') {
      halt();
      speakFrom(offset.current, next);
    }
  }, [halt, speakFrom, speed, status]);

  /** Stops and forgets the script — call it too before switching to another brief. */
  const close = useCallback(() => {
    halt();
    offset.current = 0;
    script.current = '';
    setTranscript('');
    setStatus('idle');
    setProgress(0);
    setOpen(false);
  }, [halt]);

  // Leaving the screen stops the voice; coming back shows the player paused where it was.
  // A script still being fetched is abandoned (its token is now stale), so reset to idle.
  useFocusEffect(
    useCallback(
      () => () => {
        halt();
        setStatus((current) =>
          current === 'playing' ? 'paused' : current === 'loading' ? 'idle' : current,
        );
      },
      [halt],
    ),
  );

  useEffect(() => halt, [halt]);

  return {
    supported: speech() !== null,
    status,
    open,
    transcript,
    progress,
    speed,
    start,
    toggle,
    cycleSpeed,
    close,
  };
}
