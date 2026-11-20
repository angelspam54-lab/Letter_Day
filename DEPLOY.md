# Putting Letter Day online (free)

You need three free accounts: GitHub, Neon (the database) and Render (runs the app).

## 1. Neon: the database
1. Sign in at neon.tech and create a project called "Letter Day".
2. Region: **AWS Europe Central 1 (Frankfurt)**. Only "Postgres database" switched on.
3. Copy the **connection string** (starts with `postgresql://`). Keep it private: it works like a password.

## 2. GitHub: the code
1. Unzip `letterday.zip`.
2. On github.com: **+ > New repository**, name it `letterday`, Public or Private, then **Create repository**.
3. Click **uploading an existing file**. GitHub takes at most 100 files per upload, so do it in two goes:
   - **Upload 1:** drag in the `server` folder plus all the loose files (`Dockerfile`, `render.yaml`, `package.json`, `package-lock.json`, `README.md`, `DEPLOY.md`, `docker-compose.yml`, and `.gitignore` / `.dockerignore` if you can see them). **Commit changes**.
   - **Upload 2:** **Add file > Upload files**, drag in the `client`, `shared`, `scripts` and `tools` folders. **Commit changes**.
   Check that `render.yaml`, `Dockerfile` and the `client`, `server`, `shared` folders appear at the top level of the repo.

## 3. Render: the app
1. Sign in at render.com with your GitHub account.
2. **New > Blueprint**, pick the `letterday` repo (allow Render to see it if asked).
3. When it asks for **DATABASE_URL**, paste the Neon connection string. Click **Apply** / **Deploy**.
4. Wait about 5 minutes for the first build. Your link appears at the top, like `https://letterday.onrender.com` (or `letterday-xxxx.onrender.com`).

## Good to know
- The free app sleeps after 15 minutes without players; the next visit takes about 30 seconds to wake it.
- To change anything later, upload the changed files to GitHub; Render rebuilds by itself.
- Party Rooms live in the app's memory, so a room ends if the app restarts or goes to sleep.
