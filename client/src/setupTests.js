import '@testing-library/jest-dom/vitest';

if (!window.matchMedia) {
	window.matchMedia = (media) => ({
		matches: false,
		media,
		onchange: null,
		addListener() {},
		removeListener() {},
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent() { return false; },
	});
}
