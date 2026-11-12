// Small helpers for the capture entries in this folder (files starting with _ aren't entry files).
// An entry's `steps` are the record.cjs steps; these build the common ones as JSON.
const js = (code) => ({ eval: code });
const F = '__frameling';

module.exports = {
  /** Run any command by its id (see __frameling.commands() for the list). */
  cmd: (id) => js(`${F}.run(${JSON.stringify(id)})`),
  /** Open a starter template by id, so the shot has a known document. */
  template: (id) => js(`${F}.template(${JSON.stringify(id)})`),
  /** Show a panel by id. */
  panel: (id) => js(`${F}.showPanel(${JSON.stringify(id)})`),
  /** Change preferences after the page has loaded (for the entry's own needs, never the theme). */
  prefs: (patch) => js(`${F}.prefs.set(${JSON.stringify(patch)})`),
  js,
  wait: (ms) => ({ wait: ms }),
  /** Pick a tool by its key. */
  key: (k, mods) => ({ key: k, ...(mods ? { mods } : {}) }),
};
