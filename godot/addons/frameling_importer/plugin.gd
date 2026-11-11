@tool
extends EditorPlugin

# Registers the two importers for .flplay files. The scene one is the default; pick "SpriteFrames" in the Import
# dock for the bare resource.

var _scene_importer: EditorImportPlugin
var _frames_importer: EditorImportPlugin


func _enter_tree() -> void:
	_scene_importer = preload("scene_importer.gd").new()
	_frames_importer = preload("frames_importer.gd").new()
	add_import_plugin(_scene_importer)
	add_import_plugin(_frames_importer)


func _exit_tree() -> void:
	remove_import_plugin(_scene_importer)
	remove_import_plugin(_frames_importer)
	_scene_importer = null
	_frames_importer = null
