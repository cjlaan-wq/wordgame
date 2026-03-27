# 30 Words — Setup Guide

## What you're deploying
A multiplayer word game where:
- Everyone joins on their own phone/laptop with a code
- Words are submitted privately
- The app tells each person what to do during their turn
- Points are tracked automatically

---

## Step 1 — Create a Firebase project (free, ~5 min)

Firebase is the live database that syncs everyone's phones in real time.

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"**
3. Name it anything (e.g. `word-game`)
4. Disable Google Analytics (not needed) → click **Create project**
5. Once created, click **"Realtime Database"** in the left sidebar
6. Click **"Create Database"**
7. Choose **"Start in test mode"** → Next → Enable

Now get your config:
1. Click the **gear icon** (top left) → **Project settings**
2. Scroll down to **"Your apps"** → click the **`</>`** (web) icon
3. Register the app (any name) → click **Continue to console**
4. You'll see a `firebaseConfig` object — copy it, you'll need it in Step 3

---

## Step 2 — Deploy to Vercel (free, ~5 min)

Vercel hosts your app so anyone can access it via a URL.

1. Go to **https://github.com** → create a free account if you don't have one
2. Click **"New repository"** → name it `word-game` → set to Public → Create
3. On the repo page, click **"uploading an existing file"**
4. Upload the `index.html` file from this folder → Commit changes

Now deploy:
1. Go to **https://vercel.com** → sign up with your GitHub account
2. Click **"Add New Project"** → import your `word-game` repository
3. Click **Deploy** — done! Vercel gives you a URL like `word-game-abc.vercel.app`

---

## Step 3 — Connect Firebase to your app

1. Open `index.html` in any text editor (Notepad works)
2. Find this section near the bottom:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  ...
};
```

3. Replace the whole block with the config you copied from Firebase in Step 1
4. Save the file
5. Go back to GitHub → open `index.html` → click the pencil icon → paste the new content → Commit
6. Vercel automatically redeploys — your app is live in ~30 seconds!

---

## Step 4 — Test it

1. Open your Vercel URL on two different devices (or two browser tabs)
2. On one: click **Create a game** → note the 4-letter code
3. On the other: click **Join with a code** → enter the code
4. Both should see each other in the lobby!

---

## How to play (quick reminder)

| Phase | Who does what |
|-------|--------------|
| Lobby | Host shares code, everyone joins |
| Submit words | Each person privately types 2–3 words |
| Round intro | Everyone sees their role (describer / owner / guesser) |
| Describing | Only describer sees the word — 30 sec timer |
| Guessing | Everyone votes on whose word it was |
| Reveal | Points awarded, owner revealed |
| Elaboration | Owner has 60 sec to tell the story |

---

## Something not working?

- **"Game not found"** → Check the code is exactly 4 letters, uppercase
- **Players not appearing** → Check Firebase Realtime Database is enabled and in test mode
- **App not loading** → Check the firebaseConfig was pasted correctly (no missing quotes)

Need help? Share the error message and we can fix it together.
