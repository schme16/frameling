// The screenshot, recording and check scripts load the page with ?debug and drive pixel documents without anyone to
// answer questions. In that mode the pixel "ask once" questions are skipped (the default is used), unless a script
// turns them on to take a picture of them (`window.__framelingAsk = true`).
export const inHarness = (): boolean => typeof location !== 'undefined' && /[?&]debug\b/.test(location.search) && !(globalThis as { __framelingAsk?: boolean }).__framelingAsk;
