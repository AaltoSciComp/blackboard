import React, { useState, useRef, useEffect } from "react";
import { DEBUG_LEVELS, ENDPOINT } from "../constants";
import { log } from "../logging";

const URLImage = ({ url, currentBoard, bgProps, setBgProps }) => {
    const imageRef = useRef(null);
    const [image, setImage] = useState(null);

    const loadImage = () => {
        // If we don't have a loaded blob yet, or the url has changed, do a reload
        if(!bgProps[currentBoard]?.blobsrc || url !== bgProps[currentBoard]?.url) {
            // url needs to be reasonable though
            if(url.startsWith('http')) {
                    const options = {
                    headers: {
                        'Accept': '*/*',
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getPresenterToken(),
                        'Target-URL': encodeURI(url)
                    }
                }
                fetch(ENDPOINT + `/image-proxy/` + sessionInfo.id, options)
                .then(res => res.blob())
                .then(blob => {
                    const img = new window.Image();
                    img.src = URL.createObjectURL(blob);
                    log(DEBUG_LEVELS.DEV, 'Loaded image src =', img.src);
                    img.crossOrigin = "Anonymous";
                    imageRef.current = img;
                    imageRef.current.addEventListener("load", handleLoad);
                })
            } else console.error('URL seems invalid!');
        } else {
            log(DEBUG_LEVELS.DEBUG, 'We already have this image loaded so let us use it');
            imageRef.current.src = bgProps[currentBoard].blobsrc;
        }
    };

    const handleLoad = () => {
        log(DEBUG_LEVELS.DEV, 'loaded new image for board',currentBoard);
        const x = imageRef.current.naturalWidth;
        const y = imageRef.current.naturalHeight;
        setImage(imageRef.current);
        bgProps[currentBoard] = {url: url, blobsrc: imageRef.current.src, x: x, y: y };
        bgRectRef.current.draw();
    };

    useEffect(() => {
        loadImage();
        return () => {
            if (imageRef.current) {
                imageRef.current.removeEventListener("load", handleLoad);
            }
        };
    }, []);

    useEffect(() => {
        loadImage();
    }, [url]);

    return image;
};

export default URLImage;