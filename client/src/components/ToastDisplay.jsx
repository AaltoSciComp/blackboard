import React, { useCallback } from 'react';
import toast, { Toaster, ToastBar } from 'react-hot-toast';

export const displayDev = ((message) => {
    if (message) {
        toast(message, {
            icon: '🤪',
            position: 'bottom-right',
        });
    }
});

export const displayDebug = ((message) => {
    if (message) {
        toast(message, {
            icon: '🐞'
        });
    }
});

export const displayInfo = ((message) => {
    if (message) {
        toast(message, {
            icon: 'ℹ️'
        });
    }
});

export const displayWarning = ((message) => {
    if (message) {
        toast(message, {
            icon: '⚠️'
        });
    }
});

export const displayError = ((message) => {
    if (message) {
        toast.error(message);
    }
});

export const displaySuccess = ((message) => {
    if (message) {
        toast.success(message);
    }
});

export const displayAdminMsg = ((message) => {
    toast.error(message, {
        duration: Infinity,
        position: 'top-center'
    });
});

export const ToastDisplay = () => {

    return (
        <Toaster position="bottom-center">
        {(t) => (
            <ToastBar toast={t}>
            {({ icon, message }) => (
                <>
                {icon}
                {message}
                {t.type !== 'loading' && (
                    <button onClick={() => toast.dismiss(t.id)}>X</button>
                )}
                </>
            )}
            </ToastBar>
        )}
        </Toaster>
    );
}
