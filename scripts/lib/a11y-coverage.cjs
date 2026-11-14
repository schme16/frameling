// The plain maths behind scripts/a11y.cjs's promise that it really looked at what it says it looked at. A scenario whose
// target was not on the page used to count as a pass, so a check could go green having examined nothing. No Electron in
// here, so test/a11y/coverage.test.ts runs it.

/** Fewer panels than this means the list itself came back wrong (empty, or half of it), not that the app lost panels. */
const MIN_PANELS = 15;

/** A panel's views that together hold fewer elements than this were empty, however they got on the page. */
const MIN_ELEMENTS = 3;

/**
 * Judges a run. Any scenario whose target was not on the page is a failure, never a pass. On a full run (`full`, no
 * `--only`) every panel the app lists must also have been looked at, so a panel that never got a scenario cannot hide.
 * `panels` is every id the app lists; `skipped` is `{ id: reason }` for any panel that cannot be on the page, by name.
 */
function judgeCoverage(scenarios, { panels = [], full = false, minPanels = MIN_PANELS, minElements = MIN_ELEMENTS, skipped = {} } = {}) {
  const problems = [];
  const notFound = scenarios.filter((s) => s.missing).map((s) => s.name);
  for (const name of notFound) problems.push(`${name}: not on the page, so nothing was checked`);

  const byName = new Map(scenarios.map((s) => [s.name, s]));
  const found = new Set(scenarios.filter((s) => !s.missing).map((s) => s.name));
  const expected = panels.filter((id) => !(id in skipped));
  const examined = expected.filter((id) => found.has(`panel ${id}`) && found.has(`panel ${id} (selected)`));
  if (full) {
    if (panels.length < minPanels) problems.push(`only ${panels.length} panels listed, expected at least ${minPanels}`);
    for (const id of expected) if (!found.has(`panel ${id}`) && !notFound.includes(`panel ${id}`)) problems.push(`panel ${id}: never checked`);
  }
  // Found and showing is still not looked at if there was almost nothing in it for axe to judge.
  for (const id of examined) {
    const most = Math.max(...[`panel ${id}`, `panel ${id} (selected)`].map((n) => byName.get(n)?.examined ?? Infinity));
    if (most < minElements) problems.push(`panel ${id}: axe judged only ${most} elements, so it was effectively empty`);
  }
  return { problems, notFound, panelsListed: panels.length, panelsExpected: expected.length, panelsExamined: examined.length };
}

module.exports = { MIN_PANELS, MIN_ELEMENTS, judgeCoverage };
