import '@testing-library/jest-dom/vitest';

const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudoElement) => {
  try {
    return nativeGetComputedStyle(element, pseudoElement);
  } catch (error) {
    if (error instanceof TypeError && String(error).includes('object null is not iterable')) {
      if (element instanceof HTMLElement || element instanceof SVGElement) {
        return element.style;
      }
      return document.documentElement.style;
    }
    throw error;
  }
};

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

class DOMMatrixReadOnlyMock {
  inverse() { return this; }
  transformPoint(point: DOMPointInit) { return point; }
}

Object.defineProperty(globalThis, 'DOMMatrixReadOnly', {
  writable: true,
  value: DOMMatrixReadOnlyMock,
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
