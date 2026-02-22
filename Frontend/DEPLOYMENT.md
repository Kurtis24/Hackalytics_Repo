# Vercel Deployment Fix for 404 Error

## The Issue
You're getting a 404 error because Vercel needs proper configuration to find your built files.

## Solution: Deploy from Root Directory

### Option 1: Deploy Entire Repo (Recommended)

1. **In Vercel Dashboard:**
   - Go to your project settings
   - **Root Directory**: Leave blank (deploy from root)
   - **Framework Preset**: Other
   - **Build Command**: `cd Frontend && npm install && npm run build`
   - **Output Directory**: `Frontend/dist`
   - **Install Command**: `cd Frontend && npm install`

2. **Or use Vercel CLI from root:**
   ```bash
   cd C:\Users\Brian\projects\Hackalytics_Repo
   vercel
   ```

### Option 2: Deploy Only Frontend Directory

1. **In Vercel Dashboard:**
   - Go to your project settings
   - **Root Directory**: `Frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

2. **Or use Vercel CLI from Frontend:**
   ```bash
   cd C:\Users\Brian\projects\Hackalytics_Repo\Frontend
   vercel
   ```

## Quick Fix Steps

1. **Delete current Vercel deployment:**
   ```bash
   vercel remove <your-project-name>
   ```

2. **Redeploy with correct settings:**
   ```bash
   cd C:\Users\Brian\projects\Hackalytics_Repo\Frontend
   vercel --prod
   ```

3. **When prompted:**
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N** (create new)
   - Project name? **hackalytics** (or your choice)
   - In which directory is your code located? **./** (current directory)
   - Want to override settings? **N**

## Environment Variables

Don't forget to set in Vercel Dashboard:
- `VITE_API_URL`: Your backend API URL

## Verify Build Locally

Before deploying, test locally:
```bash
cd Frontend
npm run build
npm run preview
```

If this works, your Vercel deployment should work too!

## Common Issues

### Still getting 404?
- Check that `dist` folder is created after build
- Verify `index.html` exists in `dist` folder
- Make sure Root Directory setting matches your project structure

### Build fails?
- Check Node.js version (Vercel uses Node 18+ by default)
- Verify all dependencies are in `package.json`
- Check build logs in Vercel dashboard

## Need Help?
Check the Vercel deployment logs in your dashboard for specific error messages.
