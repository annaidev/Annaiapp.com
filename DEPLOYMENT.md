# Annai Ecosystem Deployment (GitHub + Netlify)

Use this flow to deploy:
- Main app: `annaiapp.com`
- Camping app: `camping.annaiapp.com`

## 1) Main App Repo (this repo)
1. Confirm remote:
```powershell
git remote -v
```
Expected origin: `https://github.com/annaidev/Annaiapp.com.git`

2. Commit and push:
```powershell
git add .
git commit -m "Configure Netlify ecosystem routing and camping app link"
git push origin main
```

## 2) Main App Netlify Site
1. In Netlify, create/import site from `annaidev/Annaiapp.com`.
2. Build settings:
- Build command: `npm run build`
- Publish directory: `dist/public`
3. Set environment variables in Netlify:
- `VITE_ANNAI_CAMPING_URL=https://camping.annaiapp.com`
4. Do not set `VITE_API_BASE_URL` for production. The site proxies `/api/*` via `netlify.toml`.
5. Add custom domain:
- `annaiapp.com`
- `www.annaiapp.com` (optional)
6. In your domain DNS provider:
- Point Netlify DNS records as shown in Netlify domain setup.

## 3) Camping App GitHub Repo
From `Annai-Camping-Connect`, create/connect GitHub remote:
```powershell
git remote add origin https://github.com/annaidev/Annai-Camping-Connect.git
git branch -M main
git push -u origin main
```

If `origin` already exists, use:
```powershell
git remote set-url origin https://github.com/annaidev/Annai-Camping-Connect.git
git push -u origin main
```

## 4) Camping App Netlify Site
1. Import `annaidev/Annai-Camping-Connect` in Netlify.
2. Build settings:
- Build command: `npm run build`
- Publish directory: `dist/public`
3. Set environment variables:
- `VITE_API_BASE_URL=https://<your-camping-backend-domain>`
- `VITE_ANNAI_MAIN_APP_URL=https://annaiapp.com`
4. Add custom domain:
- `camping.annaiapp.com`
5. In DNS:
- Create `CNAME` for `camping` pointing to your Netlify camping site target.

## 5) Ecosystem Connection
After both deploys:
- Main app nav shows `Camping` button (reads `VITE_ANNAI_CAMPING_URL`).
- Main domain path redirect works:
  - `https://annaiapp.com/camping` -> `https://camping.annaiapp.com`
- Camping nav shows `Annai App` button (reads `VITE_ANNAI_MAIN_APP_URL`).
- Main API requests go through:
  - `https://annaiapp.com/api/*` -> `https://annaiapp-com.onrender.com/api/*`

## 6) Smoke Check
1. Open `https://annaiapp.com` and verify main app loads.
2. Click `Camping` in main nav and verify camping site opens.
3. Open `https://camping.annaiapp.com` and click `Annai App` to return.
4. Confirm API calls succeed in both apps (no 404/401 from wrong API host).
