import { useEffect, useState, useRef } from "react";

/**
 * Function from https://stackoverflow.com/questions/53845595/wrong-react-hooks-behaviour-with-event-listener
 */
export function useStateRef(initialValue) {
    const [value, setValue] = useState(initialValue);
  
    const ref = useRef(value);
  
    useEffect(() => {
      ref.current = value;
    }, [value]);
  
    return [value, setValue, ref];
}

export default useStateRef;