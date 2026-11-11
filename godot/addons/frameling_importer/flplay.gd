@tool
extends RefCounted

# Reads a Frameling package (.flplay): a zip with manifest.json and atlas.png. Turns it into SpriteFrames with one
# animation per clip, each picture held for as many frames as it was in Frameling.

const FORMAT := "frameling-playable"


# Returns {"manifest": Dictionary, "atlas": Image} or {"error": String}.
static func read(path: String) -> Dictionary:
	var zip := ZIPReader.new()
	if zip.open(path) != OK:
		return {"error": "Couldn't open %s. Is it a Frameling package (.flplay)?" % path}
	var files := zip.get_files()
	if not files.has("manifest.json"):
		zip.close()
		return {"error": "%s has no manifest.json, so it isn't a Frameling package." % path}
	var manifest = JSON.parse_string(zip.read_file("manifest.json").get_string_from_utf8())
	if typeof(manifest) != TYPE_DICTIONARY or manifest.get("format", "") != FORMAT:
		zip.close()
		return {"error": "%s isn't a Frameling package." % path}
	var atlas_name: String = manifest.get("atlas", {}).get("image", "atlas.png")
	if not files.has(atlas_name):
		zip.close()
		return {"error": "%s is missing its picture (%s)." % [path, atlas_name]}
	var image := Image.new()
	var err := image.load_png_from_buffer(zip.read_file(atlas_name))
	zip.close()
	if err != OK:
		return {"error": "The picture inside %s couldn't be read." % path}
	return {"manifest": manifest, "atlas": image}


# The size of a whole frame in atlas pixels (the stage times the export size, like Frameling works it out).
static func frame_size(m: Dictionary) -> Vector2i:
	var scale := float(m.get("scale", 1.0))
	return Vector2i(maxi(1, roundi(float(m.width) * scale)), maxi(1, roundi(float(m.height) * scale)))


# Pictures in a row of frames, with runs of the same picture merged: [[cell, frames], ...].
static func runs_of(frames: Array, start: int, end: int) -> Array:
	var out := []
	for f in range(start, end + 1):
		var cell := int(frames[f])
		if out.size() > 0 and out[-1][0] == cell:
			out[-1][1] += 1
		else:
			out.append([cell, 1])
	return out


static func build_frames(pkg: Dictionary) -> SpriteFrames:
	var m: Dictionary = pkg.manifest
	var texture := ImageTexture.create_from_image(pkg.atlas)
	var full := frame_size(m)
	var cells := []
	for c in m.get("cells", []):
		var t := AtlasTexture.new()
		t.atlas = texture
		t.region = Rect2(c.x, c.y, c.w, c.h)
		# A trimmed picture is told how much was cut off, so it still sits where it was drawn.
		if int(c.w) != full.x or int(c.h) != full.y or int(c.ox) != 0 or int(c.oy) != 0:
			t.margin = Rect2(c.ox, c.oy, full.x - int(c.w), full.y - int(c.h))
		t.filter_clip = true
		cells.append(t)

	var fps := float(m.get("fps", 12))
	var frames: Array = m.get("frames", [])
	var clips: Array = m.get("clips", [])
	if clips.is_empty() and frames.size() > 0:
		clips = [{"name": "default", "start": 0, "end": frames.size() - 1, "loop": true}]

	var sf := SpriteFrames.new()
	var keep_default := false
	for clip in clips:
		var anim := String(clip.name)
		if anim == "default":
			keep_default = true
		elif not sf.has_animation(anim):
			sf.add_animation(anim)
		sf.set_animation_speed(anim, fps)
		sf.set_animation_loop(anim, bool(clip.get("loop", true)))
		for run in runs_of(frames, int(clip.start), int(clip.end)):
			sf.add_frame(anim, cells[run[0]], float(run[1]))
	if not keep_default and sf.get_animation_names().size() > 1:
		sf.remove_animation("default")

	# Everything else the package says, for game code that wants it.
	sf.set_meta("frameling_name", m.get("name", ""))
	sf.set_meta("frameling_markers", m.get("markers", []))
	sf.set_meta("frameling_stage_size", Vector2(m.width, m.height))
	sf.set_meta("frameling_scale", float(m.get("scale", 1.0)))
	if m.has("flow"):
		sf.set_meta("frameling_flow", m.flow)
	return sf


# The first clip's name, which the scene plays when it starts.
static func first_animation(sf: SpriteFrames, m: Dictionary) -> String:
	var clips: Array = m.get("clips", [])
	if clips.size() > 0 and sf.has_animation(String(clips[0].name)):
		return String(clips[0].name)
	return String(sf.get_animation_names()[0])
