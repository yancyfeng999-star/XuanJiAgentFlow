import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => 1200 },
  offsetHeight: { configurable: true, get: () => 800 },
});

HTMLElement.prototype.getBoundingClientRect = () => ({
  width: 1200,
  height: 800,
  top: 0,
  left: 0,
  right: 1200,
  bottom: 800,
  x: 0,
  y: 0,
  toJSON: () => ({}),
});
