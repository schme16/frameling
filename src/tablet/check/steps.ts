// The pen check's step list and the report's file name. Small and apart from the recorder, so the parts of the app that
// only need these (the check's state, which the canvas reads) don't pull the whole recorder into the first download.
export type CheckStepId = 'hover' | 'pressure' | 'tilt' | 'twist' | 'eraser' | 'barrel1' | 'barrel2' | 'scribble' | 'keys';
export const CHECK_STEPS: CheckStepId[] = ['hover', 'pressure', 'tilt', 'twist', 'eraser', 'barrel1', 'barrel2', 'scribble', 'keys'];

export const reportFileName = (now: Date): string => `frameling-tablet-report-${now.toISOString().slice(0, 10)}.json`;
