-- Makes real Aseprite fixtures and a reference picture of every layer in every frame, for test/aseprite/aseprite-bin.test.ts.
-- Run: aseprite -b --script-param out=<dir> --script test/aseprite/lua/gen.lua
local out = app.params["out"]
assert(out, "pass --script-param out=<dir>")

local function sized(spec, w, h)
  local s = ImageSpec(spec)
  s.width = w
  s.height = h
  return s
end

local function rgb(r, g, b, a) return Color{ r = r, g = g, b = b, a = a or 255 } end

-- A w x h image of a colour, with a lighter dot at (1,1) so flips and offsets show.
local function pic(spec, w, h, base, dot)
  local img = Image(sized(spec, w, h))
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      img:putPixel(x, y, base)
    end
  end
  if dot then img:putPixel(1 % w, 1 % h, dot) end
  return img
end

local function gradient(w, h, spr)
  local cm = spr.colorMode
  local img = Image(sized(spr.spec, w, h))
  for y = 0, h - 1 do
    for x = 0, w - 1 do
      if cm == ColorMode.RGB then
        img:putPixel(x, y, app.pixelColor.rgba((x * 53) % 256, (y * 71) % 256, (x * y * 13) % 256, ((x + y) % 5 == 0) and 0 or 255))
      elseif cm == ColorMode.GRAY then
        img:putPixel(x, y, app.pixelColor.graya((x * 37 + y * 11) % 256, ((x + y) % 4 == 0) and 0 or 255))
      else
        img:putPixel(x, y, (x + y * 2) % 7)
      end
    end
  end
  return img
end

local specs = {}
local function save(spr, name)
  spr:saveAs(out .. "/" .. name .. ".aseprite")
end

-- Layers in file order: bottom to top, a group before its children.
local function flat(layers, list, depth)
  for _, l in ipairs(layers) do
    list[#list + 1] = l
    if l.isGroup then flat(l.layers, list, depth + 1) end
  end
  return list
end

local function setPalette(spr, colors)
  local p = spr.palettes[1]
  p:resize(#colors)
  for i, c in ipairs(colors) do p:setColor(i - 1, c) end
end

-- Every layer of every frame, drawn alone on transparent at full strength (cel opacity still applies).
local function reference(spr, name)
  local list = flat(spr.layers, {}, 0)
  local f = io.open(out .. "/" .. name .. ".txt", "w")
  f:write("frames " .. #spr.frames .. "\n")
  for i, l in ipairs(list) do
    f:write(string.format("layer %d %s\n", i - 1, l.isGroup and "group" or "image"))
    if not l.isGroup then
      for fr = 1, #spr.frames do
        local c = Sprite(spr)
        if c.colorMode ~= ColorMode.RGB then app.command.ChangePixelFormat{ format = "rgb" } end
        local cl = flat(c.layers, {}, 0)
        local target = cl[i]
        for _, x in ipairs(cl) do
          x.isVisible = false
          x.opacity = 255
          x.blendMode = BlendMode.NORMAL
        end
        target.isVisible = true
        local parent = target.parent
        while parent do
          local ok, isGroup = pcall(function() return parent.isGroup end)
          if not ok or not isGroup then break end
          parent.isVisible = true
          parent = parent.parent
        end
        local img = Image(c.width, c.height, ColorMode.RGB)
        img:drawSprite(c, fr)
        img:saveAs(string.format("%s/%s__l%d_f%d.png", out, name, i - 1, fr - 1))
        c:close()
        if spr ~= app.sprite then app.sprite = spr end
      end
    end
  end
  f:close()
end

local function done(spr, name)
  save(spr, name)
  app.sprite = spr
  reference(spr, name)
  spr:close()
end

-- Like done, but the reference comes from the saved file opened again: Aseprite adds a tile grid's start to the tiles it
-- draws until the file is saved, and the file does not keep it.
local function done_reloaded(spr, name)
  save(spr, name)
  spr:close()
  local again = app.open(out .. "/" .. name .. ".aseprite")
  app.sprite = again
  reference(again, name)
  again:close()
end

-- 1. RGBA: layers, offsets, cel opacity, opacity, blend, hidden, linked cels, durations, tags with every direction.
do
  local spr = Sprite(12, 10, ColorMode.RGB)
  local l1 = spr.layers[1]
  l1.name = "Back"
  l1.opacity = 128
  spr:newCel(l1, 1, gradient(5, 4, spr), Point(2, 3))
  local l2 = spr:newLayer()
  l2.name = "Front"
  l2.blendMode = BlendMode.MULTIPLY
  l2.isContinuous = true
  spr:newCel(l2, 1, pic(spr.spec, 3, 3, rgb(200, 30, 30), rgb(255, 255, 0)), Point(-1, 8))
  local l3 = spr:newLayer()
  l3.name = "Hidden"
  l3.isVisible = false
  spr:newCel(l3, 1, pic(spr.spec, 2, 2, rgb(1, 2, 3)), Point(0, 0))
  for i = 2, 6 do spr:newFrame() end
  spr.frames[1].duration = 0.1
  spr.frames[2].duration = 0.1
  spr.frames[3].duration = 0.2
  spr.frames[4].duration = 0.15
  spr.frames[5].duration = 0.1
  spr.frames[6].duration = 0.05
  local c = spr:newCel(l1, 3, gradient(4, 4, spr), Point(1, 1))
  c.opacity = 100
  spr:newCel(l2, 5, pic(spr.spec, 3, 3, rgb(10, 200, 30)), Point(8, 0))
  local t1 = spr:newTag(1, 2)
  t1.name = "idle"
  local t2 = spr:newTag(3, 4)
  t2.name = "back"
  t2.aniDir = AniDir.REVERSE
  local t3 = spr:newTag(4, 6)
  t3.name = "bounce"
  t3.aniDir = AniDir.PING_PONG
  t3.repeats = 3
  local t4 = spr:newTag(1, 6)
  t4.name = "bounceback"
  t4.aniDir = AniDir.PING_PONG_REVERSE
  done(spr, "rgba")
end

-- 2. Grayscale.
do
  local spr = Sprite(6, 5, ColorMode.GRAY)
  spr:newCel(spr.layers[1], 1, gradient(5, 5, spr), Point(1, 0))
  spr:newFrame()
  spr:newCel(spr.layers[1], 2, gradient(3, 3, spr), Point(0, 2))
  done(spr, "gray")
end

-- 3. Indexed: palette with alpha, transparent index other than 0, a background layer.
do
  local spr = Sprite(8, 6, ColorMode.INDEXED)
  setPalette(spr, { rgb(0, 0, 0, 0), rgb(255, 0, 0), rgb(0, 255, 0), rgb(0, 0, 255), rgb(255, 255, 0), rgb(9, 9, 9, 128), rgb(10, 200, 220), rgb(240, 240, 240) })
  spr.transparentColor = 0
  local bg = spr.layers[1]
  bg.name = "Background"
  app.command.BackgroundFromLayer()
  spr:newCel(spr.layers[1], 1, gradient(8, 6, spr), Point(0, 0))
  local top = spr:newLayer()
  top.name = "Top"
  spr:newCel(top, 1, gradient(4, 4, spr), Point(3, 1))
  spr:newFrame()
  spr:newCel(top, 2, gradient(5, 3, spr), Point(0, 3))
  done(spr, "indexed")
end

-- 4. Groups: nested, hidden, with opacity.
do
  local spr = Sprite(6, 6, ColorMode.RGB)
  local solo = spr.layers[1]
  solo.name = "Solo"
  spr:newCel(solo, 1, pic(spr.spec, 3, 3, rgb(50, 60, 70)), Point(0, 0))
  local outer = spr:newGroup()
  outer.name = "Outer"
  outer.opacity = 128
  local a = spr:newLayer()
  a.name = "A"
  a.parent = outer
  a.opacity = 200
  spr:newCel(a, 1, pic(spr.spec, 4, 4, rgb(200, 100, 50), rgb(1, 1, 1)), Point(1, 1))
  local inner = spr:newGroup()
  inner.name = "Inner"
  inner.parent = outer
  inner.isVisible = false
  local b = spr:newLayer()
  b.name = "B"
  b.parent = inner
  spr:newCel(b, 1, pic(spr.spec, 2, 2, rgb(5, 250, 5)), Point(4, 4))
  done(spr, "groups")
end

-- 5. Every blend mode Aseprite has, one layer each.
do
  local spr = Sprite(4, 4, ColorMode.RGB)
  local modes = { "NORMAL", "MULTIPLY", "SCREEN", "OVERLAY", "DARKEN", "LIGHTEN", "COLOR_DODGE", "COLOR_BURN", "HARD_LIGHT", "SOFT_LIGHT", "DIFFERENCE", "EXCLUSION", "HUE", "SATURATION", "COLOR", "LUMINOSITY", "ADDITION", "SUBTRACT", "DIVIDE" }
  for i, m in ipairs(modes) do
    local l = (i == 1) and spr.layers[1] or spr:newLayer()
    l.name = m
    l.blendMode = BlendMode[m]
    spr:newCel(l, 1, pic(spr.spec, 2, 2, rgb(20 * i, 255 - 10 * i, 100)), Point(i % 3, i % 2))
  end
  done(spr, "blends")
end

-- 6. Tilemap: tiles, flips, a cel off the grid.
do
  local spr = Sprite(16, 12, ColorMode.RGB)
  spr.layers[1].name = "Art"
  spr:newCel(spr.layers[1], 1, pic(spr.spec, 4, 4, rgb(1, 2, 3)), Point(0, 0))
  app.command.NewLayer{ tilemap = true, gridBounds = Rectangle(0, 0, 4, 4) }
  local map = spr.layers[2]
  map.name = "Map"
  local ts = map.tileset
  -- Tiles 1 and 2 get pictures.
  local t1 = spr:newTile(ts, 1)
  local i1 = Image(sized(spr.spec, 4, 4))
  i1:putPixel(0, 0, rgb(255, 0, 0))
  i1:putPixel(1, 0, rgb(255, 0, 0))
  i1:putPixel(3, 3, rgb(0, 0, 255))
  t1.image = i1
  local t2 = spr:newTile(ts, 2)
  t2.image = gradient(4, 4, spr)
  local pc = app.pixelColor
  local ts_spec = sized(spr.spec, 4, 3)
  ts_spec.colorMode = ColorMode.TILEMAP
  local img = Image(ts_spec)
  img:putPixel(0, 0, app.pixelColor.tile(1, 0))
  img:putPixel(1, 0, app.pixelColor.tile(1, pc.TILE_XFLIP))
  img:putPixel(2, 0, app.pixelColor.tile(1, pc.TILE_YFLIP))
  img:putPixel(3, 0, app.pixelColor.tile(1, pc.TILE_DFLIP))
  img:putPixel(0, 1, app.pixelColor.tile(1, pc.TILE_XFLIP | pc.TILE_DFLIP))
  img:putPixel(1, 2, app.pixelColor.tile(2, pc.TILE_XFLIP | pc.TILE_YFLIP | pc.TILE_DFLIP))
  spr:newCel(map, 1, img, Point(0, 0))
  spr:newFrame()
  spr:newCel(map, 2, img, Point(4, 4))
  -- A second map whose cel is not on the tile grid: drawn flat.
  app.command.NewLayer{ tilemap = true, gridBounds = Rectangle(0, 0, 4, 4), name = "Off" }
  local off = spr.layers[#spr.layers]
  off.name = "Off"
  spr:newCel(off, 1, img, Point(1, 2))
  done(spr, "tilemap")
end

-- 6b. A tile grid that starts off the corner (the header's grid x and y): a map on it, a map off it.
do
  local spr = Sprite(16, 12, ColorMode.RGB)
  spr.gridBounds = Rectangle(2, 3, 4, 4)
  spr.layers[1].name = "Art"
  spr:newCel(spr.layers[1], 1, pic(spr.spec, 4, 4, rgb(1, 2, 3)), Point(0, 0))
  app.command.NewLayer{ tilemap = true }
  local map = spr.layers[2]
  map.name = "Map"
  local ts = map.tileset
  local t1 = spr:newTile(ts, 1)
  local i1 = Image(sized(spr.spec, 4, 4))
  i1:putPixel(0, 0, rgb(255, 0, 0))
  i1:putPixel(1, 0, rgb(255, 0, 0))
  i1:putPixel(3, 3, rgb(0, 0, 255))
  t1.image = i1
  local t2 = spr:newTile(ts, 2)
  t2.image = gradient(4, 4, spr)
  local pc = app.pixelColor
  local ts_spec = sized(spr.spec, 3, 2)
  ts_spec.colorMode = ColorMode.TILEMAP
  local img = Image(ts_spec)
  img:putPixel(0, 0, pc.tile(1, 0))
  img:putPixel(1, 0, pc.tile(2, pc.TILE_XFLIP))
  img:putPixel(2, 0, pc.tile(1, pc.TILE_YFLIP))
  img:putPixel(0, 1, pc.tile(2, 0))
  spr:newCel(map, 1, img, Point(2, 3))
  spr:newFrame()
  spr:newCel(map, 2, img, Point(6, -1))
  app.command.NewLayer{ tilemap = true }
  local off = spr.layers[#spr.layers]
  off.name = "Off"
  spr:newCel(off, 1, img, Point(3, 3))
  done_reloaded(spr, "tilegrid")
end

-- 7. Slices, user data, a reference layer.
do
  local spr = Sprite(10, 10, ColorMode.RGB)
  local l = spr.layers[1]
  l.name = "Art"
  l.data = "layer note"
  local c = spr:newCel(l, 1, pic(spr.spec, 4, 4, rgb(9, 9, 9)), Point(2, 2))
  c.data = "cel note"
  local s = spr:newSlice(Rectangle(1, 2, 5, 6))
  s.name = "hitbox"
  s.color = rgb(10, 20, 30)
  local n = spr:newSlice(Rectangle(0, 0, 8, 8))
  n.name = "panel"
  n.center = Rectangle(2, 2, 4, 4)
  n.pivot = Point(3, 3)
  app.command.NewLayer{ reference = true }
  local ref = app.layer
  ref.name = "Ref"
  spr:newCel(ref, 1, pic(spr.spec, 2, 2, rgb(70, 80, 90)), Point(5, 5))
  spr.data = "sprite note"
  done(spr, "meta")
end

-- 8. Linked cels held over several frames (a continuous layer).
do
  local spr = Sprite(5, 5, ColorMode.RGB)
  local l = spr.layers[1]
  l.name = "Held"
  l.isContinuous = true
  spr:newCel(l, 1, pic(spr.spec, 3, 3, rgb(80, 90, 100), rgb(255, 255, 255)), Point(1, 1))
  spr:newFrame()
  spr:newFrame()
  spr:newFrame()
  spr:newCel(l, 4, pic(spr.spec, 2, 2, rgb(5, 5, 5)), Point(0, 0))
  done(spr, "linked")
end
