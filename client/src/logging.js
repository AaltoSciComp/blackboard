import { displayError, displayWarning, displayInfo, displayDebug, displayDev } from "./components/ToastDisplay.jsx";
import { DEBUG_LEVELS } from "./constants.js";

let currentDebugLevel = DEBUG_LEVELS.WARN; // Default level

export const setDebugLevel = (level) => {
    const newLevel = parseInt(level);
    if (isNaN(newLevel) && newLevel < 0 && newLevel > 4) {
        console.error('Invalid debug level:', level);
        return;
    } else {
        currentDebugLevel = level;
    }
};

export const log = (level, message, displayToast = true) => {
    if (level === undefined) {
        console.error('Debug level not set, cannot show message ', message);
    }
    if (level <= currentDebugLevel) {
        switch (level) {
            case DEBUG_LEVELS.ERROR:
                console.error(message);
                if (displayToast) displayError(message);
                break;
            case DEBUG_LEVELS.WARN:
                console.warn(message);
                if (displayToast) displayWarning(message);
                break;
            case DEBUG_LEVELS.INFO:
                console.info(message);
                if (displayToast) displayInfo(message);
                break;
            case DEBUG_LEVELS.DEBUG:
                console.info(message);
                if (displayToast) displayDebug(message);
                break;
            case DEBUG_LEVELS.DEV:
                console.info(message);
                if (displayToast) displayDev(message);
                break;
            default:
                // DEBUG_LEVELS.NONE always displays a message
                // so use this sparingly
                console.info(message);
                displayInfo(message);
                break;
        }
    }
};

// Return debug level string matching the number given as parameter
export const getDebugLevelString = (level) => {
    switch (level) {
        case DEBUG_LEVELS.NONE:
            return 'NONE';
        case DEBUG_LEVELS.ERROR:
            return 'ERROR';
        case DEBUG_LEVELS.WARN:
            return 'WARN';
        case DEBUG_LEVELS.INFO:
            return 'INFO';
        case DEBUG_LEVELS.DEBUG:
            return 'DEBUG';
        case DEBUG_LEVELS.DEV:
            return 'DEV';
        default:
            return 'UNKNOWN';
    }
}