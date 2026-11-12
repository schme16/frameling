// What the rest of the app does when a feature is turned on or off: tool and panel commands follow, the dock puts
// panels away (remembering where they were) or back in the same place, a tool that went is swapped for the brush, and
// a lesson that needed the feature is put down politely.
import { getTool } from '../core/registry';
import { store } from '../core/store';
import { getQuest, questProgress, stopQuest } from '../quests/registry';
import { pickTool } from '../tools/pick';
import { parkPanels, replacePanels, syncPanels } from '../ui/dock';
import { syncDynamicCommands } from '../ui/dynamic';
import { toast } from '../ui/toast';
import type { FeatureDescriptor } from './feature';
import { getFeature, onFeaturesChange, type FeatureChange } from './host';

/** The quest being played, when it belongs to this feature or lists it as needed. */
export function activeQuestOf(d: FeatureDescriptor): { id: string; title: string } | null {
  const id = questProgress.get().active;
  if (!id) return null;
  const own = (d.quests ?? []).find((q) => q.id === id);
  const q = own ?? getQuest(id);
  return q && (own || q.features?.includes(d.id)) ? { id, title: q.title } : null;
}

/** Runs for every switch (exported so a test can listen again after the host forgets its listeners). */
export function handleFeatureChange({ id, on }: FeatureChange): void {
  syncDynamicCommands();
  const d = getFeature(id);
  const panels = (d?.panels ?? []).map((p) => p.id);
  if (on) replacePanels(panels);
  else {
    parkPanels(panels);
    syncPanels();
    const quest = d && activeQuestOf(d);
    if (quest) {
      stopQuest();
      toast(`"${quest.title}" is on hold because ${d.name} was turned off. Turn it back on and the lesson is waiting where you left it.`, { kind: 'info' });
    }
  }
  if (!on && !getTool(store().get().ui.tool)) pickTool('brush');
}

onFeaturesChange(handleFeatureChange);
