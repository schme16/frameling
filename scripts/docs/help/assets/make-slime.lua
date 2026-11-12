-- Makes slime-bounce.aseprite, the sample for the Aseprite import help picture.
-- aseprite -b --script-param out=scripts/docs/help/assets/slime-bounce.aseprite --script scripts/docs/help/assets/make-slime.lua
local out = app.params["out"]
local spr = Sprite(28, 24, ColorMode.RGB)
local ink, body, shade, light = Color{ r = 29, g = 27, b = 38 }, Color{ r = 79, g = 154, b = 69 }, Color{ r = 31, g = 77, b = 58 }, Color{ r = 168, g = 224, b = 112 }
local pal = spr.palettes[1]
pal:resize(6)
for i, c in ipairs({ ink, body, shade, light, Color{ r = 232, g = 227, b = 238 }, Color{ r = 29, g = 27, b = 38, a = 120 } }) do pal:setColor(i - 1, c) end
local layer = spr.layers[1]
layer.name = "Slime"
local shadow = spr:newLayer()
shadow.name = "Shadow"
shadow.opacity = 90
-- Put the shadow under the slime.
shadow.stackIndex = 1

-- rows of height h and half-width w, bottom sitting on y = floor.
local function slime(img, w, h, floor)
  local cx = 14
  for y = 0, h - 1 do
    local t = (y + 0.5) / h -- 0 top .. 1 bottom
    local half = w * math.sqrt(1 - (1 - t) ^ 2.2 * 0.95)
    local yy = floor - h + y
    for x = -math.floor(half), math.floor(half) - 1 do
      local edge = (x == -math.floor(half)) or (x == math.floor(half) - 1) or y == 0 or y == h - 1
      local c = edge and ink or body
      if not edge and y >= h - 3 then c = shade end
      if not edge and y > 1 and y < 4 and x < -math.floor(half) + 4 and x > -math.floor(half) + 1 then c = light end
      img:putPixel(cx + x, yy, c)
    end
  end
  -- eyes
  img:putPixel(cx - 3, floor - h + math.floor(h * 0.45), ink)
  img:putPixel(cx - 3, floor - h + math.floor(h * 0.45) + 1, ink)
  img:putPixel(cx + 2, floor - h + math.floor(h * 0.45), ink)
  img:putPixel(cx + 2, floor - h + math.floor(h * 0.45) + 1, ink)
end

local function blob(img, w, y)
  for dy = -1, 1 do
    local half = w - math.abs(dy) * 2
    for x = -half, half do img:putPixel(14 + x, y + dy, Color{ r = 29, g = 27, b = 38, a = 120 }) end
  end
end

local poses = { { 11, 9, 21, 22 }, { 10, 12, 20, 22 }, { 9, 15, 16, 22 }, { 10, 12, 19, 22 }, { 11, 9, 21, 22 }, { 12, 7, 23, 22 } }
for i, p in ipairs(poses) do
  if i > 1 then spr:newFrame() end
  spr.frames[i].duration = (i == 3) and 0.2 or 0.1
  local a = Image(spr.spec)
  slime(a, p[1], p[2], p[3])
  spr:newCel(layer, i, a, Point(0, 0))
  local b = Image(spr.spec)
  blob(b, math.max(4, p[1] - 3 - (22 - p[3]) // 2), 22)
  spr:newCel(shadow, i, b, Point(0, 0))
end
local t = spr:newTag(1, 3)
t.name = "squash"
local t2 = spr:newTag(4, 6)
t2.name = "jump"
spr:saveAs(out)
