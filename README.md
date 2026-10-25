# Project Plus Stream Tool

A control panel and OBS overlays for Project Plus streams, inspired by [Melee Stream Tool](https://github.com/Readek/Melee-Stream-Tool).
Green theme with plus-sign patterns. Windows program (Electron), nothing to install.

## Using it

1. Download `ProjectPlusStreamTool_<version>_windows.zip` from the Releases page, unzip it and run `ProjectPlusStreamTool.exe`.
2. In OBS add a **Browser** source for each overlay you want (size **1920 x 1080** recommended; any other size also works because the overlay scales to fit the source). The addresses are on the panel's *Overlays* tab:

   | Overlay | Address |
   |---|---|
   | VS screen | `http://localhost:3939/overlays/vs.html` |
   | Scoreboard | `http://localhost:3939/overlays/scoreboard.html` |
   | Top 8 | `http://localhost:3939/overlays/top8.html` |
   | Bracket | `http://localhost:3939/overlays/bracket.html` |
   | Waiting for next game | `http://localhost:3939/overlays/waiting.html` |

   Tick *Shutdown source when not visible* and *Refresh browser when scene becomes active* so the intro animations play whenever the overlay is shown.
3. Fill in the match on the panel and press **Update** (`Ctrl+Enter`). Scores, best of, Grand Finals and the mirror switch apply immediately.

### Panel

- **Match**: tournament, round, best of 3 / 5, both players (team tag, name, character, costume, score), swap players, reset scores.
- **Grand Finals / bracket reset**: tick *Grand Finals* (put the winners-side player as Player 1). If the losers-side player wins the first set, press **Bracket reset**: scores go back to 0-0 and the overlays show "Grand Finals Reset". The button toggles if you pressed it by mistake.
- **Top 8**: type the eight players or **import them from Start.gg**: paste the event link (`https://www.start.gg/tournament/.../event/...`) and press *Import top 8*. It needs a free Start.gg API token (start.gg → your profile → Developer Settings → Create new token), which is saved only on your computer. Names, tags and countries come from Start.gg; characters are the most played one in the games reported on Start.gg, so they are empty when the event did not report characters. Flags are downloaded the first time they are needed and cached in `stream-tool-data/flags`. Check the result and press *Update*.
- **Bracket**: paste the Start.gg event link and press **Update bracket**. The overlay shows the end of the double elimination bracket (winners and losers sides mirrored left and right, grand final in the middle) as it is on Start.gg *when you press the button*; press it again after each set. *Top 8* or *Top 4* chooses how many rounds are shown. Uses the same API token.
- **Overlays tab**: pick one of 9 colour themes for each overlay (Green, Teal, Blue, Purple, Pink, Red, Orange, Gold, Steel), and **Import logo** to put your logo on every overlay, unchanged by the themes.
- **Waiting for next game** is a full-screen green overlay with plus signs: show it between games.
- The scoreboard shows win pips for first to 2 (best of 3) or first to 3 (best of 5).

### Your own or bigger art

The bundled art is 384 x 480 (42 fighters, 668 costumes, imported from the [wise-generator](https://github.com/juanwise/wise-generator) repository). Put your own
images in `stream-tool-data/custom-art/<fighter>/<costume number>.png` (next to the program, created on first run). They are used instead of the bundled ones;
any size, transparent background, PNG / WebP / JPG. Selector icons work the same way in `stream-tool-data/custom-icons/`.
Fighter folder names: `mario`, `king_dedede`, `mr_game_and_watch`, `rob`, ... (see `assets/characters.json`).

## Development

```
npm install
npm start          # control panel in Electron
npm run server     # just the server, panel at http://localhost:3939/ (no Electron needed)
node tools/selfTest.js
npm run dist       # Windows zip in dist/ (run on Windows)
```

- `server.js`: serves the panel and overlays, keeps the match state (`stream-tool-data/state.json`) and pushes changes to the overlays over server-sent events.
- `overlays/`: the four overlays (plain HTML/CSS/JS, no libraries). `theme.css` holds the colours and the plus pattern.
- `panel/`: the control panel.
- `tools/importAssets.py <wise-generator folder>` regenerates `assets/` from the fighter art there.
- Releases: publishing a GitHub release builds the Windows zip and attaches it (`.github/workflows/build.yml`).

## Credits

Idea and layout inspired by Melee Stream Tool by Readek. Font: [Inter](https://rsms.me/inter/) (SIL Open Font License, see `assets/fonts/Inter-LICENSE.txt`).
Project Plus and the fighters belong to their respective owners.
