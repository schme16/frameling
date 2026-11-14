-- Makes the blend comparison fixtures for scripts/e2e/blend-aseprite.cjs with the real Aseprite (batch mode, no window):
-- for every blend mode and several layer opacities, a drawing whose bottom layer is a column of backdrop colours (opaque
-- and see-through) and whose top layer is a row of source colours, so every pair of colours meets once. It saves the
-- .aseprite file and what Aseprite composites it to (raw RGBA bytes).
--   aseprite -b --script-param out=<dir> --script scripts/e2e/blend-aseprite.lua
local out = app.params["out"]
assert(out, "pass --script-param out=<dir>")

local base = {
  { 0, 0, 0 }, { 255, 255, 255 }, { 128, 128, 128 }, { 255, 0, 0 }, { 0, 255, 0 }, { 0, 0, 255 },
  { 255, 255, 0 }, { 0, 255, 255 }, { 255, 0, 255 }, { 230, 170, 140 }, { 20, 90, 100 }, { 200, 220, 90 },
  { 64, 64, 64 }, { 192, 192, 192 }, { 90, 30, 160 }, { 250, 140, 20 },
}
local function list(alphas)
  local l = {}
  for _, a in ipairs(alphas) do
    for _, c in ipairs(base) do l[#l + 1] = { c[1], c[2], c[3], a } end
  end
  return l
end
local S = list({ 255, 192, 128, 64, 0 })
local B = list({ 255, 128, 64, 0 })

local modes = {
  "NORMAL", "MULTIPLY", "SCREEN", "OVERLAY", "DARKEN", "LIGHTEN", "COLOR_DODGE", "COLOR_BURN", "HARD_LIGHT",
  "SOFT_LIGHT", "DIFFERENCE", "EXCLUSION", "HSL_HUE", "HSL_SATURATION", "HSL_COLOR", "HSL_LUMINOSITY", "ADDITION",
  "SUBTRACT", "DIVIDE",
}
local opacities = { 255, 191, 128, 64 }

local W, H = #S, #B
local function px(c) return app.pixelColor.rgba(c[1], c[2], c[3], c[4]) end

for _, m in ipairs(modes) do
  for _, op in ipairs(opacities) do
    local spr = Sprite(W, H, ColorMode.RGB)
    local back = spr.layers[1]
    back.name = "Back"
    local bi = Image(W, H, ColorMode.RGB)
    for y = 0, H - 1 do
      for x = 0, W - 1 do bi:putPixel(x, y, px(B[y + 1])) end
    end
    spr:newCel(back, 1, bi, Point(0, 0))
    local top = spr:newLayer()
    top.name = "Top"
    top.blendMode = BlendMode[m]
    top.opacity = op
    local ti = Image(W, H, ColorMode.RGB)
    for y = 0, H - 1 do
      for x = 0, W - 1 do ti:putPixel(x, y, px(S[x + 1])) end
    end
    spr:newCel(top, 1, ti, Point(0, 0))
    local name = string.format("%s_%d", m, op)
    spr:saveAs(out .. "/" .. name .. ".aseprite")
    local flat = Image(spr.spec)
    flat:drawSprite(spr, 1)
    local f = io.open(out .. "/" .. name .. ".rgba", "wb")
    f:write(flat.bytes)
    f:close()
    spr:close()
  end
end
local f = io.open(out .. "/inputs.json", "w")
local function js(l)
  local t = {}
  for _, c in ipairs(l) do t[#t + 1] = string.format("[%d,%d,%d,%d]", c[1], c[2], c[3], c[4]) end
  return "[" .. table.concat(t, ",") .. "]"
end
f:write(string.format('{"w":%d,"h":%d,"src":%s,"back":%s,"modes":[%s],"opacities":[%s]}', W, H, js(S), js(B), '"' .. table.concat(modes, '","') .. '"', table.concat(opacities, ",")))
f:close()
