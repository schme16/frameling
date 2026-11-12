-- Makes a small sprite with frames of different delays, tags and slices, for test/pixel/import-aseprite-bin.test.ts.
-- Run: aseprite -b --script-param out=<dir> --script test/pixel/lua/sheet.lua
local out = assert(app.params["out"], "pass --script-param out=<dir>")
local function rgb(r, g, b, a) return Color{ r = r, g = g, b = b, a = a or 255 } end

local spr = Sprite(20, 14, ColorMode.RGB)
local layer = spr.layers[1]
layer.name = "Art"
for f = 1, 4 do
  if f > 1 then spr:newEmptyFrame(f) end
  local img = Image(spr.spec)
  -- A block that walks right, a lighter dot that shows its frame number; the rest stays see-through so trimming has work to do.
  for y = 4, 9 do
    for x = 2 + f * 2, 7 + f * 2 do img:putPixel(x, y, rgb(40 * f, 200 - 30 * f, 90)) end
  end
  img:putPixel(3 + f * 2, 5, rgb(255, 255, 0))
  spr:newCel(layer, f, img, Point(0, 0))
end
spr.frames[1].duration = 0.1
spr.frames[2].duration = 0.1
spr.frames[3].duration = 0.2
spr.frames[4].duration = 0.1
local a = spr:newTag(1, 2); a.name = "walk"
local b = spr:newTag(3, 4); b.name = "stop"; b.aniDir = AniDir.PING_PONG
local s = spr:newSlice(Rectangle(1, 2, 12, 10))
s.name = "panel"
s.center = Rectangle(3, 3, 6, 4)
s.pivot = Point(6, 10)
s.color = rgb(200, 30, 60)
local h = spr:newSlice(Rectangle(4, 4, 5, 3))
h.name = "hitbox"
spr:saveAs(out .. "/sheet.aseprite")
