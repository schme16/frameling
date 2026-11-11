// Whether this hello is the very first one (then the welcome sheet follows it). Its own module so the sheet itself can
// load on first use.
let firstRun = false;
export const markFirstRun = (v: boolean) => void (firstRun = v);
export const isFirstRun = () => firstRun;
