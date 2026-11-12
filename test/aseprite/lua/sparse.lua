-- A sprite whose cels cover the whole canvas but paint only a 40 x 40 block (for the lazy reader's check).
local W, H, F, L = 1000, 1000, 12, 2
local spr = Sprite(W, H, ColorMode.RGB)
for l = 2, L do spr:newLayer() end
for f = 2, F do spr:newEmptyFrame() end
for l = 1, L do
  for f = 1, F do
    local img = Image(W, H, ColorMode.RGB)
    img:clear(Color{ r = 0, g = 0, b = 0, a = 0 })
    for y = 300, 339 do for x = 400, 439 do img:drawPixel(x, y, Color{ r = (f * 7) % 256, g = (l * 80) % 256, b = 120, a = 255 }) end end
    spr:newCel(spr.layers[l], f, img, Point(0, 0))
  end
end
spr:saveAs(app.params["out"] .. "/sparse.aseprite")
