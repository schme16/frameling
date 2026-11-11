@tool
extends EditorImportPlugin

# .flplay -> a scene with an AnimatedSprite2D, ready to drag into a level. Its SpriteFrames are built in.

const Flplay := preload("flplay.gd")


func _get_importer_name() -> String:
	return "frameling.scene"


func _get_visible_name() -> String:
	return "Frameling animated sprite (scene)"


func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["flplay"])


func _get_save_extension() -> String:
	return "scn"


func _get_resource_type() -> String:
	return "PackedScene"


func _get_priority() -> float:
	return 1.0


func _get_import_order() -> int:
	return 0


func _get_preset_count() -> int:
	return 1


func _get_preset_name(_preset_index: int) -> String:
	return "Default"


func _get_import_options(_path: String, _preset_index: int) -> Array[Dictionary]:
	return [
		{"name": "autoplay", "default_value": true},
		{"name": "centered", "default_value": true},
		# Auto uses what the package says: crisp pixels for pixel art, smooth otherwise.
		{"name": "filter", "default_value": 0, "property_hint": PROPERTY_HINT_ENUM, "hint_string": "Auto,Nearest (pixel art),Linear"},
		# On: the sprite shows at the stage size you drew at, whatever size it was exported at.
		{"name": "stage_size", "default_value": false},
	]


func _get_option_visibility(_path: String, _option_name: StringName, _options: Dictionary) -> bool:
	return true


func _can_import_threaded() -> bool:
	return false


func _import(source_file: String, save_path: String, options: Dictionary, _platform_variants: Array[String], _gen_files: Array[String]) -> Error:
	var pkg := Flplay.read(source_file)
	if pkg.has("error"):
		push_error(pkg.error)
		return ERR_FILE_UNRECOGNIZED
	var m: Dictionary = pkg.manifest
	var sf := Flplay.build_frames(pkg)

	var node := AnimatedSprite2D.new()
	var node_name := String(m.get("name", "")).validate_node_name().strip_edges()
	node.name = node_name if node_name != "" else source_file.get_file().get_basename().validate_node_name()
	node.sprite_frames = sf
	var first := Flplay.first_animation(sf, m)
	node.animation = first
	if options.get("autoplay", true):
		node.autoplay = first
	node.centered = options.get("centered", true)
	match int(options.get("filter", 0)):
		1:
			node.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		2:
			node.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		_:
			if m.get("pixelArt", false):
				node.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if options.get("stage_size", false):
		var s := float(m.get("scale", 1.0))
		if s > 0.0:
			node.scale = Vector2.ONE / s

	var scene := PackedScene.new()
	var err := scene.pack(node)
	node.free()
	if err != OK:
		return err
	return ResourceSaver.save(scene, "%s.%s" % [save_path, _get_save_extension()])
