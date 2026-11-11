@tool
extends EditorImportPlugin

# .flplay -> SpriteFrames (one animation per clip). Choose it in the Import dock when you only want the resource.

const Flplay := preload("flplay.gd")


func _get_importer_name() -> String:
	return "frameling.spriteframes"


func _get_visible_name() -> String:
	return "Frameling SpriteFrames"


func _get_recognized_extensions() -> PackedStringArray:
	return PackedStringArray(["flplay"])


func _get_save_extension() -> String:
	return "res"


func _get_resource_type() -> String:
	return "SpriteFrames"


func _get_priority() -> float:
	return 0.5


func _get_import_order() -> int:
	return 0


func _get_preset_count() -> int:
	return 1


func _get_preset_name(_preset_index: int) -> String:
	return "Default"


func _get_import_options(_path: String, _preset_index: int) -> Array[Dictionary]:
	return []


func _get_option_visibility(_path: String, _option_name: StringName, _options: Dictionary) -> bool:
	return true


func _can_import_threaded() -> bool:
	return false


func _import(source_file: String, save_path: String, _options: Dictionary, _platform_variants: Array[String], _gen_files: Array[String]) -> Error:
	var pkg := Flplay.read(source_file)
	if pkg.has("error"):
		push_error(pkg.error)
		return ERR_FILE_UNRECOGNIZED
	var sf := Flplay.build_frames(pkg)
	return ResourceSaver.save(sf, "%s.%s" % [save_path, _get_save_extension()])
