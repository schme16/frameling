// Commands that go grey in some state and say nothing about what would turn them on. Like the other lists in this
// folder it can only shrink: the test fails when a command that is grey with no reason is not here, and it fails when a
// line is left behind after the command got its reason.
//
// To pay one off, give the command a `reason` (next to its `enabled`, or in src/core/commandReasons.ts) and delete its
// line. Do not add a line to get a new command past the audit: write the sentence, it is one line. Say what to do, in
// plain words ("Select some shapes first"), not what is wrong.
export const NO_REASON_YET: Record<string, string> = {};
