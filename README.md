# Resource pack editor

A Spectra launcher addon that turns off parts of any resource pack: its leaves, a mob, the hotbar, sounds, a
language. Minecraft then takes those parts from the packs below it, or from the vanilla look, so you can mix packs the
way you want.

It works with every pack, zipped or a folder. Packs made for ResPackOpts do not need that mod for this.

## How it works

1. Open an instance, then the **Pack editor** tab.
2. Pick a resource pack. Its files are grouped into parts a player recognises: blocks, items, mobs, armor, interface,
   particles, sky, sounds, languages and so on. A block keeps its texture, animation, model, blockstate, connected
   textures and PBR maps together; files in the pack's overlay folders count as the same part.
3. Click parts to turn them off, or untick a whole category or group.
4. **Save** writes `<pack> (edited).zip` next to the original without those files, turns the original off and puts
   the copy in the original's place in the game's pack order (`options.txt`). The original file is never changed.

Opening the original or its copy later shows the same parts turned off, and saving again replaces the copy. The game
has to be closed while saving: it keeps its packs open and rewrites `options.txt` when it quits.

## Permissions

| Permission | Why |
|---|---|
| `instances:read` | List the instance's resource packs and check whether the game is running |
| `resourcepacks:read` | List the files inside a pack and show their textures |
| `resourcepacks:write` | Save the edited copy |

## Layout

```
addon/            the addon itself: addon.json, ui/, icons/, locales/
test/             node tests
```

`addon/ui/elements.js` sorts a pack's files into parts and has no browser code, so it is tested on its own.

## Developing

- Tests: `npm test`. One test reads every `.zip` in `PACKS_DIR` (by default `C:/Users/Patryk/Desktop/resy`) and
  checks that each file of each pack ends up in exactly one part; it is skipped when the folder is missing.
- In the launcher turn on developer mode in Settings → Addons and load the `addon` folder.
- To publish, zip the contents of `addon/` so `addon.json` sits at the top of the archive.
