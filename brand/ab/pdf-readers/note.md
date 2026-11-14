# Hidden layers in a PDF, as real readers show them

Frameling writes each layer as optional content (an OCG), with hidden ones listed in `/OFF`. A reader that ignores
optional content would draw art that is meant to be switched off, and the person would find things in the file they
thought they had hidden.

Checked on 14 November 2026, with `scripts/e2e/pdf-readers.cjs` and then by opening the same files in the user's own
Chrome.

| Reader | What it uses | Result |
|---|---|---|
| Chrome | PDFium | Hidden layers stay hidden, in all four cases |
| poppler (`pdftoppm`) | what most Linux viewers use | Agrees with Frameling's own picture, 0.003 to 0.010 |
| Ghostscript | `gs` | Agrees, 0.009 to 0.017 |
| MuPDF | `mutool` | Not on this computer |
| Firefox | pdf.js | **Not checked:** `/usr/bin/firefox` here is the snap stub and Firefox is not installed |
| Acrobat | | **Not checked, and not a target:** the user does not have it |

Each pair below is the same frame: Frameling's own picture on the left, the PDF drawn by Chrome on the right.

- `hidden-layers-*`: a hidden layer, a hidden folder, a hidden layer inside a hidden folder, a hidden layer inside a
  shown folder, and a hidden masked folder. Only the blue background, the purple rectangle and the orange circle
  should show.
- `hidden-in-effect-folder-*`: hidden layers inside a folder with a blur on it. The blur survives and the hidden art
  does not come back.
- `layers-folders-*` and `nested-folders-*`: the ordinary cases, to show that nothing that should show went missing.
