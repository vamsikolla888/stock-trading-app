import type { LiveTick } from '@/features/market/lib/liveQuote';

import { fromFnoTick, MAX_BATCH_SYMBOLS, PriceStream, type StreamSocket } from '../priceStream';

type Handler = (...args: never[]) => void;

class FakeSocket implements StreamSocket {
  connected = false;
  active = false;
  emitted: [string, unknown][] = [];
  private handlers = new Map<string, Handler[]>();

  connect() {
    this.active = true;
  }
  disconnect() {
    const was = this.connected;
    this.connected = false;
    this.active = false;
    if (was) this.fire('disconnect', 'io client disconnect');
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload]);
  }
  on(event: string, listener: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }
  removeAllListeners() {
    this.handlers.clear();
  }
  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? [])
      (handler as (...a: unknown[]) => void)(...args);
  }
  /** The server accepted the handshake. */
  open() {
    this.connected = true;
    this.active = true;
    this.fire('connect');
  }
  events(name: string) {
    return this.emitted.filter(([event]) => event === name).map(([, payload]) => payload);
  }
}

function setup() {
  const socket = new FakeSocket();
  const frames: (() => void)[] = [];
  let now = 1_000;
  const stream = new PriceStream({
    createSocket: () => socket,
    now: () => now,
    frame: (fn) => frames.push(fn),
  });
  const flushFrames = () => frames.splice(0).forEach((fn) => fn());
  return {
    socket,
    stream,
    flushFrames,
    advance: (ms: number) => {
      now += ms;
      jest.advanceTimersByTime(ms);
    },
  };
}

const tick = (symbol: string, ltp: number, exchange = 'NSE'): LiveTick => ({
  exchange,
  symbol,
  ltp,
  change: null,
  changePct: null,
  prevClose: null,
  direction: null,
  volume: null,
  ohlc: null,
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('PriceStream connection', () => {
  it('opens the socket with the first watch and closes it 10 s after the last', () => {
    const { socket, stream, advance } = setup();
    expect(socket.active).toBe(false);
    const release = stream.retain('NSE:TCS', 'list');
    expect(socket.active).toBe(true);
    socket.open();
    release();
    advance(9_000);
    expect(socket.connected).toBe(true);
    advance(1_500);
    expect(socket.connected).toBe(false);
    expect(stream.getStatus()).toBe('idle');
  });

  it('a new watch within the idle window keeps the connection', () => {
    const { socket, stream, advance } = setup();
    stream.retain('NSE:TCS', 'list')();
    socket.open();
    advance(5_000);
    stream.retain('NSE:INFY', 'list');
    advance(20_000);
    expect(socket.connected).toBe(true);
  });

  it('drops the connection in the background and reconnects in the foreground', () => {
    const { socket, stream } = setup();
    stream.retain('NSE:TCS', 'list');
    socket.open();
    stream.setForeground(false);
    expect(socket.connected).toBe(false);
    stream.setForeground(true);
    expect(socket.active).toBe(true);
  });
});

describe('PriceStream subscriptions', () => {
  it('sends ONE debounced batch for a list mounting many rows', () => {
    const { socket, stream, advance } = setup();
    stream.retain('NSE:TCS', 'list');
    socket.open(); // on connect: the batch goes at once
    stream.retain('NSE:INFY', 'list');
    stream.retain('BSE:500325', 'list');
    advance(150);
    const batches = socket.events('watch:batch') as { key: string; targets: unknown[] }[];
    expect(batches).toHaveLength(2);
    expect(batches[1]).toEqual({
      key: 'app',
      targets: [
        { exchange: 'NSE', symbol: 'TCS' },
        { exchange: 'NSE', symbol: 'INFY' },
        { exchange: 'BSE', symbol: '500325' },
      ],
    });
  });

  it('reference-counts: a symbol two rows show is released only by the second', () => {
    const { socket, stream, advance } = setup();
    socket.connect();
    socket.open();
    const a = stream.retain('NSE:TCS', 'list');
    const b = stream.retain('NSE:TCS', 'list');
    advance(150);
    a();
    a(); // a double release is a no-op
    advance(150);
    expect(socket.events('unwatch:batch')).toHaveLength(0);
    b();
    advance(150);
    expect(socket.events('unwatch:batch')).toEqual([{ key: 'app' }]);
  });

  it('streams a detail screen symbol on its own and leaves it out of the batch', () => {
    const { socket, stream, advance } = setup();
    socket.connect();
    socket.open();
    stream.retain('NSE:TCS', 'list');
    const release = stream.retain('NSE:TCS', 'stream');
    advance(150);
    expect(socket.events('watch:symbol')).toEqual([
      { exchange: 'NSE', symbol: 'TCS', mode: 'stream' },
    ]);
    expect(stream.batchTargets()).toEqual([]);
    release();
    expect(socket.events('unwatch:symbol')).toEqual([
      { exchange: 'NSE', symbol: 'TCS', mode: 'stream' },
    ]);
    expect(stream.batchTargets()).toEqual(['NSE:TCS']);
  });

  it('caps the batch at the server ceiling, earliest watches first', () => {
    const { stream } = setup();
    for (let i = 0; i < MAX_BATCH_SYMBOLS + 5; i++) stream.retain(`NSE:S${i}`, 'list');
    const targets = stream.batchTargets();
    expect(targets).toHaveLength(MAX_BATCH_SYMBOLS);
    expect(targets[0]).toBe('NSE:S0');
  });

  it('rebuilds every subscription on reconnect', () => {
    const { socket, stream } = setup();
    stream.retain('NSE:TCS', 'list');
    stream.retain('NSE:INFY', 'stream');
    stream.retain('NFO:NIFTY25OCT25100CE', 'fno');
    socket.open();
    socket.disconnect();
    socket.emitted = [];
    socket.open();
    expect(socket.events('watch:symbol')).toEqual([
      { exchange: 'NSE', symbol: 'INFY', mode: 'stream' },
    ]);
    expect(socket.events('watch:batch')).toEqual([
      { key: 'app', targets: [{ exchange: 'NSE', symbol: 'TCS' }] },
    ]);
    // The detail screen's stock rides the F&O feed too, after the F&O instruments.
    expect(socket.events('fno:watch')).toEqual([
      { key: 'app', instruments: ['NFO:NIFTY25OCT25100CE', 'NSE:INFY'] },
    ]);
  });
});

describe('PriceStream ticks', () => {
  it('stores watched ticks and notifies once per frame, per symbol', () => {
    const { socket, stream, flushFrames } = setup();
    stream.retain('NSE:TCS', 'list');
    socket.open();
    const heard = jest.fn();
    stream.subscribeKey('NSE:TCS', heard);
    socket.fire('prices:batch', { key: 'app', ticks: [tick('TCS', 3900), tick('TCS', 3901)] });
    socket.fire('price:update', tick('TCS', 3902));
    expect(heard).not.toHaveBeenCalled();
    flushFrames();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(stream.getQuote('NSE:TCS')).toMatchObject({ ltp: 3902, dir: 'up' });
  });

  it('drops ticks for symbols nothing watches', () => {
    const { socket, stream, flushFrames } = setup();
    stream.retain('NSE:TCS', 'list');
    socket.open();
    socket.fire('price:update', tick('INFY', 1500));
    flushFrames();
    expect(stream.getQuote('NSE:INFY')).toBeUndefined();
  });

  it('keeps an unwatched quote briefly, then lets readers fall back to REST', () => {
    const { socket, stream, flushFrames, advance } = setup();
    const release = stream.retain('NSE:TCS', 'list');
    socket.open();
    socket.fire('price:update', tick('TCS', 3900));
    flushFrames();
    const heard = jest.fn();
    stream.subscribeKey('NSE:TCS', heard);
    release();
    advance(29_000);
    expect(stream.getQuote('NSE:TCS')).toBeDefined();
    advance(2_000);
    expect(stream.getQuote('NSE:TCS')).toBeUndefined();
    expect(heard).toHaveBeenCalled();
  });

  it('maps F&O ticks into the same store', () => {
    expect(fromFnoTick({ i: 'NFO:NIFTY25OCT25100CE', ltp: 132.5, c: 120, v: 900 })).toMatchObject({
      exchange: 'NFO',
      symbol: 'NIFTY25OCT25100CE',
      ltp: 132.5,
      prevClose: 120,
      volume: 900,
    });
    const { socket, stream, flushFrames } = setup();
    stream.retain('NFO:NIFTY25OCT25100CE', 'fno');
    socket.open();
    socket.fire('fno:ticks', { key: 'app', ticks: [{ i: 'NFO:NIFTY25OCT25100CE', ltp: 132.5 }] });
    flushFrames();
    expect(stream.getQuote('NFO:NIFTY25OCT25100CE')?.ltp).toBe(132.5);
  });

  it('forgets everything on reset (sign-out)', () => {
    const { socket, stream, flushFrames } = setup();
    stream.retain('NSE:TCS', 'list');
    socket.open();
    socket.fire('price:update', tick('TCS', 3900));
    flushFrames();
    stream.reset();
    expect(stream.getQuote('NSE:TCS')).toBeUndefined();
    expect(stream.batchTargets()).toEqual([]);
    expect(socket.connected).toBe(false);
  });
});
