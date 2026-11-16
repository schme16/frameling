// Time for "is this quick" checks, measured as the CPU the work used rather than the wall clock.
//
// A wall-clock budget is a guess about a duration. It passes alone and fails when ~25 test workers share the machine:
// select/mask "is quick on 256 x 256" took 31 ms alone and 267 ms against a 250 ms budget with six suites running, and
// the autosave "repeat vs first" ratio failed on 2011 ms against 1598 ms because the two phases met different load.
// CPU time only counts the time this process was actually running, so being descheduled does not count against the
// code. (Each test file runs in its own process, so this is that file's own work.)
export function cpuMs(): number {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
}
