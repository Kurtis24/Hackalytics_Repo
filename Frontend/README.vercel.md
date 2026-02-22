# Vercel Deployment Guide

## Quick Deploy

1. **Install Vercel CLI** (optional, but recommended):
   ```bash
   npm install -g vercel
   ```

2. **Deploy to Vercel**:
   ```bash
   cd Frontend
   vercel
   ```

## Configuration

### Environment Variables

Set these in your Vercel project settings:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variable:
   - `VITE_API_URL`: Your backend API URL (e.g., `https://your-backend.vercel.app/api/v1`)

### Build Settings

Vercel will automatically detect these settings from `vercel.json`:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

## Manual Deployment via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Select the `Frontend` directory as the root
5. Add environment variables (see above)
6. Click **"Deploy"**

## Local Production Preview

Test the production build locally:

```bash
npm run build
npm run preview
```

## Important Notes

1. **API URL**: Make sure to update `VITE_API_URL` in Vercel's environment variables to point to your deployed backend
2. **CORS**: Ensure your backend allows requests from your Vercel domain
3. **SPA Routing**: The `vercel.json` configuration handles client-side routing automatically

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Verify Node.js version compatibility (Vercel uses Node 18+ by default)

### API Calls Fail
- Verify `VITE_API_URL` is set correctly in Vercel environment variables
- Check CORS settings on your backend
- Ensure backend is deployed and accessible

### 404 on Routes
- The `vercel.json` rewrites should handle this automatically
- If issues persist, check that `vercel.json` is in the Frontend directory

## Deployment Checklist

- [ ] Update `.env.production` with production API URL
- [ ] Push changes to GitHub
- [ ] Import project to Vercel
- [ ] Set environment variables in Vercel dashboard
- [ ] Deploy and test
- [ ] Configure custom domain (optional)
