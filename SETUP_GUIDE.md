# 30s Words — Setup Guide

Your app is ready. Follow these steps to get it live. Takes about 15–20 minutes total.

---

## Step 1 — Set up Firebase (the real-time database)

Firebase is a free Google service that lets all your players' phones stay in sync.

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"** → give it any name (e.g. `30s-words`) → click through the setup
3. Once inside your project, click **"Build"** in the left sidebar → **"Realtime Database"**
4. Click **"Create Database"** → choose any location → start in **test mode** (this is fine for private use)
5. Now click the **gear icon** (top left) → **"Project settings"**
6. Scroll down to **"Your apps"** → click the **`</>`** (web) icon
7. Give it a nickname → click **"Register app"**
8. You'll see a block of code with values like `apiKey`, `databaseURL` etc. — **copy the whole firebaseConfig object**

Now open the file `src/firebase.js` in the code folder and **replace** the placeholder values with your real ones.

---

## Step 2 — Deploy to Vercel (puts it on the internet)

Vercel is a free hosting service. No credit card needed.

1. Go to **https://github.com** and create a free account if you don't have one
2. Create a new repository called `wordgame` and upload the entire code folder to it
   - Click **"Add file"** → **"Upload files"** → drag the whole `wordgame` folder in
3. Go to **https://vercel.com** → sign up with your GitHub account
4. Click **"Add New Project"** → select your `wordgame` repository
5. Vercel will detect it's a React app automatically → click **"Deploy"**
6. In about 60 seconds you'll get a live URL like `https://wordgame-abc123.vercel.app`

**Share that URL with your team before the session — that's the whole app!**

---

## How to play

### Before the session
Everyone opens the URL on their own phone or laptop.

### In the session
1. One person clicks **"Create new game"** — they become the host
2. A 4-letter code appears (e.g. `X7KP`) — share it verbally or on a shared screen
3. Everyone else enters the code + their name to join
4. Each player privately types their 2–3 words on their own screen and hits **"Submit my words"**
5. When everyone is ready, the host clicks **"Start game"**

### Each round
- Each phone shows the right view automatically — the describer sees the word, the owner gets a sit-out screen, everyone else sees a guessing screen
- The describer has 30 seconds — they can also click **"Skip this word"** if needed
- After guessing, everyone votes on whose word it is
- The owner gets 1 minute to elaborate
- Host advances to next round

---

## Tips

- Use the app on **mobile** — it's designed for phones
- The host's phone controls the pace (start round, confirm guesses, next round)
- Firebase free tier supports up to 100 simultaneous connections — more than enough for your team
- If you want to play again, just refresh and create a new game

---

## Troubleshooting

**"Game not found"** — double-check the 4-letter code, it's case-sensitive (always uppercase)

**Players not syncing** — check that `databaseURL` in `firebase.js` is correct and includes `https://`

**Blank screen on Vercel** — make sure all files including `public/index.html` were uploaded
