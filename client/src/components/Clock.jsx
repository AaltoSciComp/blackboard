import React, { useState, useEffect } from "react";
import Button from "react-bootstrap/Button";

function Clock() {
    const timer = useNewTimer(new Date());
 
    return (
        <Button title="Current time" variant="secondary" style={{width: 75}}>{timer.toLocaleTimeString('fi-FI')}</Button>
     );
 }
 
 function useNewTimer(currentDate) {
     const [date, setDate] = useState(currentDate);
     
     useEffect(() => {
       var timerID = setInterval( () => tick(), 1000 );
       return function cleanup() {
           clearInterval(timerID);
         };
      });
     
     function tick() {
        setDate(new Date());
      }
     
     return date;
   }
export default Clock;
