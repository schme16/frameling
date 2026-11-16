// Whether the start-a-vote box is open. Just that: what is typed in it lives in the box and goes with it.
import { createStore } from '../ui/mini';

export const voteSetupOpen = createStore<boolean>(false);
export const openVoteSetup = (): void => voteSetupOpen.set(true);
export const closeVoteSetup = (): void => voteSetupOpen.set(false);
