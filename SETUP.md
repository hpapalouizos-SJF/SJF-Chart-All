# SJF Pitch Chart — iPad setup

The app runs completely offline once it's installed. It has to be put on a free web host **one time** so the iPad can download it.

## 1. Put it online (one time, about 10 minutes, free)

**GitHub Pages (recommended, permanent)**
1. Make a free account at github.com.
2. Click **+ → New repository**. Name it `sjf-chart`, set it to **Public**, and click **Create repository**.
3. Click **uploading an existing file**. Drag in everything from this folder, including the `icons` folder, then click **Commit changes**.
4. Go to **Settings → Pages**. Under "Branch," pick **main** and **/(root)**, then click **Save**.
5. After 1–2 minutes the app is live at `https://YOUR-USERNAME.github.io/sjf-chart/`.

*(Netlify Drop also works: drag the folder onto app.netlify.com/drop and make a free account so the site stays up.)*

Only the app's code is public. Game data never leaves the iPad.

## 2. Install it on the iPad (do this on Wi-Fi)
1. Open the link in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it once from the new **SJF Chart** icon. That saves everything for offline use.
4. To test, turn on Airplane Mode and open it again. It should load normally.

**Always open the app from the Home Screen icon.** A Safari tab keeps its own separate copy of the data.

## 3. Before the season
- **Rosters → Paste a whole roster**, one player per line: `22 Fulton R R P` (number, name, bats, throws, P for pitchers).
- **Settings:** set your pillar standards (free bases 5.5 is already filled in) and any other targets.
- **iPad:** Settings → Display & Brightness → Auto-Lock → **Never** on game days. The app tries to keep the screen on by itself, but older iPads don't always honor that.

## 4. Game day
**New game** → enter the opponent, home/away, and lineups → **Start game**. No lineup yet? Leave the spots blank — a gold **Who's up?** card asks for each hitter's number the first time he bats.

For each pitch: **pitch type → velo → tap location → result**.

**After the game:** go to the **Export** tab and choose **Everything at once**, then use **Save to Files**, **AirDrop**, or **Mail**. In Synergy Video Express, use **Pitch Chart Upload** to upload both chart PDFs (one for each team's pitchers) *before* the video.

Every so often, go to the home screen and tap **Back up everything**.

## Pitch-calling chart
At **New game**, pick **Pitch-calling chart** to chart only their hitters (pitch type, result, where it went). Each hitter's full breakdown stays on screen before and during every at-bat, with the on-deck hitter below. **All games** adds earlier games against him. It still exports the Synergy chart of SJF pitching.

## Bullpens
Home → **Bullpens** → **+ New bullpen**. Pick one pitcher, or two to chart side-by-side mounds, then choose **Pen script** or **Free pen**. For each pitch: pitch type (it stays selected) → target → velo → tap where it landed → **Strike** or **Ball**. **Pitcher history** shows every pen and the trends. **PDF of the day** puts every pitcher's sheet in one file.

## Updating the app later
Upload the changed files to the same GitHub repository and change the `VERSION` line at the top of `sw.js` (for example `v1.0.1`). The next time the iPad opens the app on Wi-Fi, an **Update now** button appears on the Games screen. Saved games are not affected.
