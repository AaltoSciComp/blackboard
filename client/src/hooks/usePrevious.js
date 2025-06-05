import { useEffect, useRef } from "react";

// Function from https://blog.logrocket.com/accessing-previous-props-state-react-hooks/
function usePrevious(value) {
    const ref = useRef();
    useEffect(() => {
      ref.current = value; //assign the value of ref to the argument
    },[value]); //this code will run when the value of 'value' changes
    return ref.current; //in the end, return the current ref value.
}

export default usePrevious;