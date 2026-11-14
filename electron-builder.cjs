// The electron-builder settings (they used to sit under "build" in package.json). They are a script so the .flplay
// file type is only claimed while Interactives is switched on: see src/features/flags.ts and flags.json.
const interactives = require('./src/features/flags.json').interactives === true;

const config = {
  "appId": "com.schme16.frameling",
  "productName": "Frameling",
  "directories": {
    "output": "release",
    "buildResources": "build"
  },
  "files": [
    "dist/**/*",
    "package.json"
  ],
  "artifactName": "${productName}-${version}-${os}-${arch}.${ext}",
  "toolsets": {
    "appimage": "1.0.3"
  },
  "linux": {
    "target": [
      "AppImage"
    ],
    "category": "Graphics",
    "synopsis": "Draw and animate 2D art",
    "syncDesktopName": true,
    "mimeTypes": [
      "x-scheme-handler/frameling",
      "application/x-aseprite"
    ]
  },
  "win": {
    "target": [
      "nsis",
      "portable"
    ],
    "signtoolOptions": {
      "publisherName": "Frameling (self-signed)"
    }
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "include": "build/installer.nsh",
    "artifactName": "${productName}-${version}-setup-${arch}.${ext}"
  },
  "portable": {
    "artifactName": "${productName}-${version}-portable-${arch}.${ext}"
  },
  "mac": {
    "target": [
      "dmg"
    ],
    "category": "public.app-category.graphics-design",
    "identity": null,
    "hardenedRuntime": false,
    "gatekeeperAssess": false,
    "fileAssociations": [
      {
        "ext": [
          "aseprite",
          "ase"
        ],
        "name": "Aseprite sprite",
        "description": "Aseprite sprite",
        "role": "Viewer",
        "rank": "Alternate"
      }
    ]
  },
  "fileAssociations": [
    {
      "ext": "frameling",
      "name": "Frameling drawing",
      "description": "Frameling drawing",
      "mimeType": "application/x-frameling",
      "role": "Editor"
    }
  ],
  "protocols": [
    {
      "name": "Frameling link",
      "schemes": [
        "frameling"
      ]
    }
  ],
  "afterPack": "build/after-pack.cjs"
};

if (interactives) {
  config.fileAssociations.push({
    ext: 'flplay',
    name: 'Interactives animation',
    description: 'Frameling animation for Interactives',
    mimeType: 'application/vnd.frameling.playable+zip',
    role: 'Editor',
  });
}

module.exports = config;
