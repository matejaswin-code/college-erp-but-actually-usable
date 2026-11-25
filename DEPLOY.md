# Deploying College ERP (Vercel, Fly.io & Google Cloud Run)

All commands below assume you are inside the `college-erp` project folder:

```powershell
cd college-erp
```

---

## Option 1: Deploy to Vercel

The project is preconfigured for Vercel via [`vercel.json`](./vercel.json), [`api/index.py`](./api/index.py), and [`requirements.txt`](./requirements.txt):
- **Frontend (`frontend/`)** is served statically from Vercel's CDN.
- **Backend (`/api/*` and `/health`)** runs as a FastAPI Python serverless function.

### Important Vercel notes
- **Database:** Vercel's filesystem is ephemeral. Without `DATABASE_URL`, the app falls back to temporary SQLite in `/tmp/dev.db` so preview deploys still boot, **but data resets on cold starts**. Connect a hosted PostgreSQL database (Neon, Supabase, or Vercel Marketplace Postgres) via `DATABASE_URL` for persistent data.
- **File uploads:** `/tmp/uploads` is ephemeral on serverless instances. Persistent file uploads require object storage (e.g. Vercel Blob or S3).

### Deploy via Vercel CLI
```powershell
cd college-erp
npx vercel login
npx vercel link

# Set production environment variables (recommended)
npx vercel env add DATABASE_URL production
npx vercel env add JWT_SECRET production

# Deploy to production
npx vercel --prod
```

Or push `college-erp/` to GitHub, import it in the Vercel Dashboard (set **Root Directory** to `college-erp` if the repo has the nested folder), add `DATABASE_URL` and `JWT_SECRET` in **Settings → Environment Variables**, and click **Deploy**.

---

## Option 2: Deploy to Fly.io (Containerized)

The root [`Dockerfile`](./Dockerfile) packages both the FastAPI backend and the static frontend into a single container listening on `$PORT` (default `8080`). No separate Nginx container is required.

### Prerequisites
- Install `flyctl`: `pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"`
- Log in: `fly auth login`

### 1. Pick an app name and region
Edit `app` and `primary_region` in `fly.toml` (e.g. `bom` for Mumbai, `sin` for Singapore, `iad` for US East), then initialize the app without deploying yet:

```powershell
fly launch --copy-config --no-deploy
```

### 2. Create the persistent volume (for uploads, and optional SQLite)
```powershell
fly volumes create erp_data --size 1 --region bom
```
*(Match `--region` to `primary_region` in `fly.toml`.)*

### 3. Configure database and secrets

Generate a strong random `JWT_SECRET` in PowerShell:
```powershell
$jwt = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

- **With Managed PostgreSQL (recommended — Fly Managed Postgres, Neon, or Supabase):**
  ```powershell
  fly secrets set JWT_SECRET="$jwt" DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require" CORS_ORIGINS="https://<your-app>.fly.dev"
  ```
- **Or single-machine SQLite on the Fly volume (quickest demo, keep `min_machines_running = 0` and 1 machine):**
  ```powershell
  fly secrets set JWT_SECRET="$jwt" DATABASE_URL="sqlite:////data/erp.db" CORS_ORIGINS="https://<your-app>.fly.dev"
  ```

### 4. Deploy
```powershell
fly deploy
fly open
```

> **Note:** After the first successful deploy seeds demo data, you can optionally set `RUN_SEED_ON_START = "false"` in `fly.toml` for faster cold starts.

---

## Option 2: Deploy to Google Cloud Run

### Prerequisites
- Install Google Cloud CLI (`gcloud`) and authenticate:
  ```powershell
  gcloud auth login
  gcloud config set project <YOUR_GCP_PROJECT_ID>
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
  ```
- Provision a PostgreSQL database (Cloud SQL for PostgreSQL, Neon, or Supabase) and copy its connection URL.

### 1. Generate a `JWT_SECRET`
```powershell
$jwt = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

### 2. Build and deploy from source
```powershell
gcloud run deploy college-erp `
  --source . `
  --region asia-south1 `
  --allow-unauthenticated `
  --memory 512Mi `
  --set-env-vars "DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require,JWT_SECRET=$jwt,COOKIE_SECURE=true,RUN_SEED_ON_START=true,UPLOAD_DIR=/tmp/uploads"
```

*(If using Cloud SQL instead of an external Postgres URL, add `--add-cloudsql-instances <PROJECT:REGION:INSTANCE>` and pass the Unix socket `DATABASE_URL`.)*

### 3. Update `CORS_ORIGINS` (optional)
Because the frontend and API share the same Cloud Run URL, browser requests are same-origin. If you also access the API cross-origin, set `CORS_ORIGINS` to your deployed `https://college-erp-xxxx.a.run.app` URL.

### Important note about uploads on Cloud Run
Cloud Run's container filesystem (`/tmp/uploads`) is ephemeral and resets when instances scale to zero or redeploy. For persistent assignment submissions and study materials on Cloud Run, mount a Google Cloud Storage bucket as a Cloud Run volume at `/data/uploads` and set `UPLOAD_DIR=/data/uploads`.
