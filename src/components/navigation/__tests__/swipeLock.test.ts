import { act, renderHook } from '@testing-library/react-native';

import { holdTabSwipe, useSwipeHold, useTabSwipeHeld } from '../swipeLock';

describe('swipeLock', () => {
  it('holds while any hold is taken, and only the last release unlocks', () => {
    const { result } = renderHook(() => useTabSwipeHeld());
    expect(result.current).toBe(false);

    let first: () => void = () => {};
    let second: () => void = () => {};
    act(() => {
      first = holdTabSwipe();
      second = holdTabSwipe();
    });
    expect(result.current).toBe(true);

    act(() => first());
    expect(result.current).toBe(true);

    // Releasing twice must not unlock someone else's hold.
    act(() => first());
    expect(result.current).toBe(true);

    act(() => second());
    expect(result.current).toBe(false);
  });

  it("a component's hold takes once and is released on unmount", () => {
    const held = renderHook(() => useTabSwipeHeld());
    const hold = renderHook(() => useSwipeHold());

    act(() => {
      hold.result.current.take();
      hold.result.current.take();
    });
    expect(held.result.current).toBe(true);

    act(() => hold.result.current.release());
    expect(held.result.current).toBe(false);

    act(() => hold.result.current.take());
    expect(held.result.current).toBe(true);
    act(() => hold.unmount());
    expect(held.result.current).toBe(false);
  });
});
