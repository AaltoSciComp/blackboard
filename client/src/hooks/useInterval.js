import { useEffect, useRef } from "react";

/**
 * Function from https://overreacted.io/making-setinterval-declarative-with-react-hooks/
 * Copyright (C) 2019 Dan Abramov
 */
function useInterval(callback, delay) {
    const savedCallback = useRef();

    // Remember the latest callback.
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // Set up the interval.
    useEffect(() => {
        function tick() {
        savedCallback.current();
        }
        if (delay !== null) {
        let id = setInterval(tick, delay);
        return () => clearInterval(id);
        }
    }, [delay]);
}

export default useInterval;