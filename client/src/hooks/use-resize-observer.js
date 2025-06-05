import { useLayoutEffect, useState, useRef } from "react";
//import ResizeObserver from "resize-observer-polyfill";
import { useDebouncedCallback } from "use-debounce";

// Adapted to use the newest use-debounce from:
// https://codesandbox.io/s/1g8cj?file=/src/hooks/use-resize-observer.js:0-1254

export const useResizeObserver = ({ ref, debounceDelay = 0 }) => {
  const animationFrameRef = useRef(null);
  const [size, setSize] = useState({});
  const debouncedCallback = useDebouncedCallback(
    value => {
      setSize(value);
    },
    debounceDelay,
    {
      leading: true
    }
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const resizeObserver = new ResizeObserver(entries => {
      animationFrameRef.current = window.requestAnimationFrame(() => {
        if (!Array.isArray(entries) || !entries.length) {
          return;
        }

        const entry = entries[0];

        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);

        debouncedCallback({
          width,
          height
        });
      });
    });

    resizeObserver.observe(element);

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.unobserve(element);
    };
  }, [ref, debouncedCallback]);

  return size;
};
