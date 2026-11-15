// What each greyed command needs, by command id: the sentence a menu, tooltip, button or palette row shows while it is
// grey. A command can also carry its own `reason` (see registry.ts), which wins over this table; a new command should
// do that, next to its `enabled`. This table is the one place the existing ones were written up together, so the
// wording stays in one voice and the shared sentences stay shared.
//
// Write what to do, not what is wrong, in plain words and the second person: "Select some shapes first", not "No
// selection". The sentence is only asked while the command is grey, so it can assume the thing is missing. Where two
// different things can be missing, look at the state and say whichever one it is (see `inSymbol` below).
//
// test/findability/state-coverage.test.ts fails for a command that goes grey and has no reason, except the ones on
// test/findability/known-no-reason.ts, which can only shrink.
import { findLayer } from './doc';
import type { Command } from './registry';
import type { State } from './store';
import { needManyShapes, needPixelLayer, needShapes, nothingToRedo, nothingToUndo, pickKindReason, say, type Reason } from './reasons';

const inSymbol = (s: State) => !!s.doc.editing?.length;
/** The artboard commands only work on the top level, so inside a symbol that is the first thing to fix. */
const closeSymbolFirst = 'Close the symbol you are editing first.';
const artboardsFirst = (what: string): Reason => (s) => (inSymbol(s) ? closeSymbolFirst : `${what} needs a second artboard. Add one first.`);
const variationFirst = (what: string): Reason => (s) => (inSymbol(s) ? closeSymbolFirst : `${what} works on a variation. Pick one in the Artboards panel first.`);
const outsideSymbol: Reason = (s) => (inSymbol(s) ? closeSymbolFirst : 'Not while artboards share their layers. Make them separate first.');

const needLayer = say('Pick a layer first.');
const needClip = say('Pick a clip in the Clips panel first.');
const needTween = say('Make an in-between on this frame first.');
const needRig = say('Add some bones to this layer first.');
const needBone = say('Pick a bone first.');
const needTile = say('Pick a tile in the Tileset panel first.');
const needTiles = say('Add some tiles first.');
const needKeys = say('Pick some drawings on the timeline first.');
const needText = say('Select some text first.');
const needMarks = say('Nothing is marked on this frame.');
const needPixel = (what: string): Reason => say(`${what} works on a pixel layer. Pick one first.`);
const needPicture = say('Add a reference picture first.');
const needDrawingHere = say('Draw something on this frame first.');
const needSymbolInstance = say('Select a symbol on the canvas first.');
const needNotes = say('Add a note first.');
const needNoteText = say('Write something in the note first.');
const needPasteKeys = say('Copy some drawings on the timeline first.');
const needMotionSpot = say('Draw something on a frame first, then pick it.');
const needBoards = say('Needs more than one board. Add another first.');
const needSelectionOrPixels = say('Select something first.');

/** Greyed commands, by id. A sentence for the state the command is grey in. */
export const COMMAND_REASONS: Record<string, Reason> = {
  // ----- undo and redo
  'edit.undo': nothingToUndo,
  'history.back': nothingToUndo,
  'edit.redo': nothingToRedo,
  'history.forward': nothingToRedo,

  // ----- nothing picked
  'edit.copy': needSelectionOrPixels,
  'edit.cut': needSelectionOrPixels,
  'edit.duplicate': needSelectionOrPixels,
  'edit.delete': say('Select something to delete first.'),
  'edit.copySvg': needShapes,
  'edit.paste': pickKindReason(['vector', 'pixel'], 'Pasting'),
  'select.all': say('Draw something on this layer first, then there is something to select.'),
  'select.none': say('Nothing is selected.'),
  'select.invert': needPixel('Inverting a selection'),
  'select.wand': needPixel('The magic wand'),
  'select.flipH': needShapes,
  'select.flipV': needShapes,
  'select.numbers': needSelectionOrPixels,
  'colors.recolourSelection': say('Select something to recolour first.'),
  'tween.pathFromSelection': say('Select a line on the canvas first.'),
  'trim.drawOff': say('Select a shape first.'),
  'trim.drawOn': say('Select a shape first.'),
  'trim.whole': say('Select a shape first.'),
  ...Object.fromEntries(
    ['nudgeUp', 'nudgeDown', 'nudgeLeft', 'nudgeRight', 'nudgeUpMore', 'nudgeDownMore', 'nudgeLeftMore', 'nudgeRightMore'].map((n) => [`select.${n}`, say('Select something to move first.')]),
  ),
  ...Object.fromEntries(['alignBottom', 'alignCentre', 'alignLeft', 'alignMiddle', 'alignRight', 'alignTop'].map((n) => [`select.${n}`, say('Select some shapes first, or make a pixel selection.')])),
  'select.spreadAcross': say('Select three or more shapes first.'),
  'select.spreadDown': say('Select three or more shapes first.'),

  // ----- arrange and combine shapes
  'arrange.back': needShapes,
  'arrange.backward': needShapes,
  'arrange.forward': needShapes,
  'arrange.front': needShapes,
  'arrange.group': needShapes,
  'arrange.breakApart': needShapes,
  'arrange.strokeToLine': say('Select a shape on a vector layer first.'),
  'arrange.tidyStroke': say('Select a shape with an outline on a vector layer first.'),
  'arrange.ungroup': say('Select a group first.'),
  'shapes.cut': needManyShapes,
  'shapes.join': needManyShapes,
  'shapes.overlap': needManyShapes,
  'shapes.punch': needManyShapes,
  'draw.toggleMerge': pickKindReason(['vector'], 'Merging shapes'),
  'pen.stabilizer': say('Pick a drawing tool, like the brush or pen, first.'),

  // ----- layers
  'layers.addHalf': say('This layer already has both halves.'),
  'layers.delete': say('A drawing needs at least one layer, so this one stays.'),
  'layers.deletePair': say('Pick a layer that is half of a pair, with another layer left over.'),
  'layers.unpair': say('Pick a layer that is half of a pair first.'),
  'layers.flipMask': say('Pick a layer that is a mask first.'),
  'layers.maskOnOff': say('Pick a layer that is a mask first.'),
  'layers.removeMask': say('Pick a layer that is a mask first.'),
  'layers.maskSwitch': say('Pick a layer that has a mask first.'),
  'layers.folderIntoFolder': say('Pick a layer inside a folder first.'),
  'layers.folderOutOfFolder': say('Pick a folder that sits inside another folder first.'),
  'layers.outOfFolder': say('Pick a layer inside a folder first.'),
  'layers.ungroupFolder': say('Pick a layer inside a folder first.'),
  'effects.reset': say('This layer has no effects or blend to put back.'),

  // ----- artboards
  'artboards.delete': artboardsFirst('Deleting one'),
  'artboards.export': artboardsFirst('Exporting them one by one'),
  'artboards.exportAtlas': artboardsFirst('An atlas'),
  'artboards.fitAll': artboardsFirst('Fitting them all'),
  'artboards.fitBars': artboardsFirst('Fitting them all'),
  'artboards.fitFill': artboardsFirst('Fitting them all'),
  'artboards.lineUp': artboardsFirst('Lining them up'),
  'artboards.next': artboardsFirst('Moving between them'),
  'artboards.previous': artboardsFirst('Moving between them'),
  'artboards.pictureCustom': artboardsFirst('Choosing the picture'),
  'artboards.pictureFirst': artboardsFirst('Choosing the picture'),
  'artboards.pictureLargest': artboardsFirst('Choosing the picture'),
  'artboards.playAll': artboardsFirst('Playing them one after another'),
  'timeline.onionBoards': artboardsFirst('Seeing the others as a ghost'),
  'artboards.detachVariation': variationFirst('Detaching'),
  'artboards.goToOriginal': variationFirst('Going to the original'),
  'artboards.recolourVariation': variationFirst('Recolouring'),
  'artboards.resetVariation': variationFirst('Resetting'),
  'artboards.exportVariations': (s) => (inSymbol(s) ? closeSymbolFirst : 'Make a variation of this artboard first.'),
  'artboards.sameSpeed': (s) => (inSymbol(s) ? closeSymbolFirst : s.doc.sharedLayers ? outsideSymbol(s) : 'Needs two or more artboards that play at different speeds.'),
  'artboards.makeVariation': outsideSymbol,
  'artboards.variation.square': outsideSymbol,
  'artboards.variation.tall': outsideSymbol,
  'artboards.variation.wide': outsideSymbol,
  'artboards.new': say(closeSymbolFirst),
  'artboards.duplicate': say(closeSymbolFirst),
  'artboards.find': say(closeSymbolFirst),
  'artboards.zoomTo': say(closeSymbolFirst),
  'camera.add': (s) => (inSymbol(s) ? 'Close the symbol you are editing first.' : 'This drawing already has a camera.'),

  // ----- the timeline
  'timeline.duplicateKey': say('Click an empty part of the canvas to deselect first.'),
  'timeline.makeOwnDrawing': say('Pick a drawing that is shown in more than one place first.'),
  'timeline.nameKey': say('Pick a frame with a drawing on it first.'),
  'timeline.offsetReset': say('This drawing has not been moved on its own.'),
  'timeline.toggleProperties': say('Pick a layer first.'),
  'timeline.clearInOut': say('There is no in or out point to clear.'),
  'timeline.clipBackAndForth': needClip,
  'timeline.clipBackAndForthEnd': needClip,
  'timeline.clipBackward': needClip,
  'timeline.clipDuplicate': needClip,
  'timeline.clipForever': needClip,
  'timeline.clipForward': needClip,
  'timeline.clipOnce': needClip,
  'timeline.copyKeys': needKeys,
  'timeline.cutKeys': needKeys,
  'timeline.deleteKeys': needKeys,
  'timeline.keysEarlier': needKeys,
  'timeline.keysLater': needKeys,
  'timeline.keysSpread': say('Pick two or more drawings on the timeline first.'),
  'timeline.keysSqueeze': say('Pick two or more drawings on the timeline first.'),
  'timeline.pasteKeys': needPasteKeys,
  'timeline.pasteKeysAtEnd': needPasteKeys,
  'timeline.pasteKeysInPlace': needPasteKeys,
  'flow.fromAny': needClip,
  'flow.try': say('Make a clip first.'),
  'marks.clearAll': say('Nothing is marked yet.'),
  'marks.clearFrame': needMarks,

  // ----- in-betweens and motion
  'tween.make': needDrawingHere,
  'tween.morph': needDrawingHere,
  'tween.drawPath': needDrawingHere,
  'tween.recordMove': needMotionSpot,
  'tween.recordAgain': say('Record a move first.'),
  'tween.recordPlay': say('Record a move first.'),
  'tween.remove': needTween,
  'tween.hints': say('Pick an in-between on a shape first.'),
  'tween.hints.clear': say('This in-between has no hints to clear.'),
  ...Object.fromEntries(['backIn', 'backOut', 'bounceOut', 'easeIn', 'easeInOut', 'easeOut', 'elasticOut', 'linear'].map((e) => [`tween.ease.${e}`, needTween])),
  ...Object.fromEntries(['bounce', 'fadeIn', 'float', 'popIn', 'shake', 'wobble'].map((m) => [`motion.${m}`, say('Draw something on this frame first, then it can move.')])),

  // ----- the camera
  'camera.lookThrough': say('Add a camera first.'),
  'camera.pick': say('Add a camera first.'),
  'camera.reset': say('Add a camera first.'),

  // ----- symbols
  'symbols.edit': needSymbolInstance,
  'symbols.resetTransform': needSymbolInstance,
  'symbols.swap': needSymbolInstance,
  'symbols.exit': say('You are not inside a symbol.'),
  'symbols.exitAll': say('You are not inside a symbol.'),
  'symbols.deleteUnused': say('There are no symbols yet.'),
  'symbols.makeFrames': (s) => (inSymbol(s) ? 'Close the symbol you are editing first.' : 'Draw something on this layer first.'),
  'symbols.makeOne': (s) => (inSymbol(s) ? 'Close the symbol you are editing first.' : 'Draw something on this frame first.'),

  // ----- text
  'text.toShapes': needText,
  ...Object.fromEntries(['fade', 'rotate', 'scale', 'slide', 'typewriter', 'wave'].map((a) => [`text.animate.${a}`, needText])),
  'text.pixelSmaller': say('The text is already as small as it goes.'),

  // ----- pixel art
  'pixel.flipH': needPixelLayer,
  'pixel.flipV': needPixelLayer,
  'pixel.rotate': needPixelLayer,
  'pixel.rotate180': needPixelLayer,
  'pixel.rotateLeft': needPixelLayer,
  'pixel.rotateRight': needPixelLayer,
  'pixel.nextColor': needPixelLayer,
  'pixel.previousColor': needPixelLayer,
  'pixel.outline': needPixelLayer,
  'pixel.outlineInside': needPixelLayer,
  'pixel.paletteLock': needPixelLayer,
  'pixel.reduceToPalette': needPixelLayer,
  'palette.fromDrawing': needPixelLayer,
  'palette.fromSwatches': say('Add some colours to your swatches first.'),
  'tools.dither': needPixel('Dither'),
  'pixel.sizeDown': say('Pick a pixel layer that can go smaller first.'),
  'pixel.sizeUp': say('Pick a pixel layer that can go bigger first.'),
  'pixel.swapPaintBack': say('Pick a fill colour first.'),
  'pixel.changeWay': say('Start a pixel art drawing first.'),
  'pixel.boardsToFrames': say('Needs more than one board in a pixel art drawing.'),
  'pixel.framesToBoards': say('Needs a pixel art drawing with more than one frame and a single board.'),
  'pixel.shareLayers': needBoards,
  'pixel.unshareLayers': say('The boards are not sharing layers.'),
  'pixel.makeItMove': say('Needs a pixel art picture, not an animation.'),
  'pixel.deleteSlice': say('Pick a slice first.'),
  'brush.pixelReset': say('Pick a pixel brush that has been changed first.'),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`pixel.zoom${n}`, needPixelLayer])),
  'transform.pivotMiddle': say('Pick a drawing first.'),
  'transform.apply': say('Nothing has been changed yet.'),
  'transform.putBack': say('Nothing has been changed yet.'),
  'convert.toPixels': needPixelLayer,
  'convert.toShapes': say('Pick a layer with something drawn on it first.'),

  // ----- brushes
  'brush.copyText': say('Save a brush of your own first.'),
  'brush.saveFile': say('Save a brush of your own first.'),
  'brush.delete': say('Pick a brush of your own first. The built-in ones stay.'),
  'brush.rename': say('Pick a brush of your own first. The built-in ones stay.'),
  'brush.update': say('Change a brush of your own first.'),

  // ----- tiles
  'tiles.addTerrain': needTiles,
  'tiles.addValue': needTiles,
  'tiles.export': needTiles,
  'tiles.nextTile': needTiles,
  'tiles.prevTile': needTiles,
  'tiles.showShapes': needTiles,
  'tiles.autoEdges': say('Add some terrain tiles first.'),
  'tiles.makeEdgeTiles': say('Add a terrain first.'),
  'tiles.guessEdges': say('Pick a tile that has a terrain first.'),
  'tiles.clearShapes': say('This tile has no collision shapes.'),
  'tiles.oneWay': say('Give this tile a collision shape first.'),
  'tiles.delete': needTile,
  'tiles.duplicate': needTile,
  'tiles.edit': needTile,
  'tiles.drawBox': needTile,
  'tiles.drawShape': needTile,
  'tiles.solid': needTile,
  'tiles.done': say('You are not editing a tile.'),
  'tiles.flipX': pickKindReason(['tilemap'], 'Flipping tiles'),
  'tiles.flipY': pickKindReason(['tilemap'], 'Flipping tiles'),
  'tiles.rotate': pickKindReason(['tilemap'], 'Turning tiles'),

  // ----- bones
  'rig.addChildBone': needBone,
  'rig.deleteBone': needBone,
  'rig.deleteBranch': needBone,
  'rig.renameBone': needBone,
  'rig.togglePin': needBone,
  'rig.pickParent': say('Pick a bone that has a parent first.'),
  'rig.pickChild': say('Pick a bone that has a child first.'),
  'rig.autoAttach': needRig,
  'rig.mirrorPose': needRig,
  'rig.resetPose': needRig,
  'rig.savePose': needRig,
  'rig.swapSides': needRig,
  'rig.bendLayer': say('Add some bones, then pick a drawing layer that is not the skeleton.'),
  'rig.detachLayer': say('Pick a layer that is attached to bones first.'),
  'rig.normaliseWeights': say('Pick a layer that is attached to bones first.'),
  'rig.paintWeights': say('Pick a layer that is attached to bones first.'),
  'rig.smoothWeights': say('Pick a layer that is attached to bones first.'),
  'particles.shuffle': say('Select a particle first.'),

  // ----- audio, notes, reference pictures
  'audio.mute': say('Add some sound first.'),
  'audio.remove': say('Add some sound first.'),
  'audio.startHere': say('Add some sound first.'),
  'notes.clearDone': say('Tick a note as done first.'),
  'notes.next': needNotes,
  'notes.previous': needNotes,
  'notes.toggleDone': needNoteText,
  'reference.fill': needPicture,
  'reference.fit': needPicture,
  'reference.place': needPicture,
  'reference.reset': needPicture,
  'reference.toggleShow': needPicture,
  'reference.pictureFromHere': say('Pick a layer that has a reference picture first.'),
  'reference.removeFromHere': say('Pick a frame where a picture starts, on a layer with more than one.'),

  // ----- view
  'view.clearGuides': say('There are no guides to clear.'),
  'view.clearLightTable': say('The light table is empty.'),
  'view.removePerspective': say('This drawing has no perspective grid.'),
  'view.showPerspective': say('This drawing has no perspective grid.'),
  'view.resetTurn': say('The canvas is not turned.'),
  'view.dockAllWindows': say('No panels are floating.'),
  'view.featuresAllOn': say('Everything is already turned on.'),
  'view.menusReset': say('Your menus are as they came.'),
  'view.menusEverywhere': say('Change the menus here first, and have another workspace that does not have the change yet.'),
  'view.toolRailWidthReset': say('The tool rail is already its usual width.'),
  'view.toolsHome': say('The tools are already docked.'),
  'view.toolsReset': say('The tool rail is as it came.'),
  'view.toolsShowAll': say('No tools are hidden.'),
  'popout.front': say('Open the second window first.'),
  'popout.toggle': say('The second window needs the desktop app.'),

  'view.toolGroupFold': say('Set the tool rail style to Two wide in Preferences first.'),
  ...Object.fromEntries(['toolRailWider', 'toolRailNarrower', 'toolRailFit'].map((n) => [`view.${n}`, say('Dock the tool rail to the left or right first.')])),
  'view.lightTableDrawing': needLayer,
  'quillPet.pat': say('Turn on Show Quill in Preferences first.'),
  'quillPet.give': say('Turn on Show Quill in Preferences first.'),

  // ----- layer effects, masks and folders
  ...Object.fromEntries(['blur', 'glow', 'shadow', 'adjust', 'outline', 'pixelate', 'grain', 'wave', 'fringe', 'vignette', 'motionblur'].map((e) => [`effects.add.${e}`, needLayer])),
  'colors.recolourLayer': say('Add a layer first.'),
  'colors.recolourFrame': say('Add a layer first.'),
  'layers.newFolder': needLayer,
  'layers.intoFolder': needLayer,
  'layers.addMask': (s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId);
    if (l?.kind === 'camera') return 'A camera layer cannot have a mask. Pick another layer first.';
    return l?.mask ? 'This layer is already a mask.' : 'Pick a layer first.';
  },
  'text.pixelBigger': say('The text is already as big as it goes.'),

  // ----- quests
  'quests.cardHome': say('Start a quest first.'),
  'quests.resume': say('Pause a quest first.'),
  'quests.stop': say('Start a quest first.'),
  'quests.tuckCard': say('Start a quest first.'),
};

/** What a greyed command says it needs right now, or undefined if nobody wrote that down for it. */
export function reasonFor(c: Partial<Pick<Command, 'id' | 'reason'>>, s: State): string | undefined {
  try {
    return (c.reason ?? COMMAND_REASONS[c.id ?? ''])?.(s) || undefined;
  } catch {
    return undefined;
  }
}

/** Does this command have a reason written for it, in itself or in the table? */
export function hasReason(c: Partial<Pick<Command, 'id' | 'reason'>>): boolean {
  return !!(c.reason ?? COMMAND_REASONS[c.id ?? '']);
}
