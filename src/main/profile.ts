// Import this first in main.ts: it moves a profile's data folder before anything reads it.
import { app } from 'electron';
import path from 'node:path';
import { PROFILE, profileFolderName } from './profileName';

const folder = profileFolderName(PROFILE);
if (folder) app.setPath('userData', path.join(app.getPath('appData'), folder));
