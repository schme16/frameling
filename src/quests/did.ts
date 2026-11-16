// What Quill says on the Great work card about the step you just finished. The words are in lines.json
// (quests.did.<quest id>.<step id>), so they can be edited with the rest of his lines. A step can still carry its own
// `did` in the quest, which wins; a step with neither falls back to counting steps off.
import { LINES, line, type LineId } from '../ui/mascot/lines';

export const didLineId = (questId: string, stepId: string): string => `quests.did.${questId}.${stepId}`;

/** Quill's words for this step, or undefined when he has none. */
export function didWords(questId: string, stepId: string): string | undefined {
  const id = didLineId(questId, stepId);
  return id in LINES ? line(id as LineId) : undefined;
}
