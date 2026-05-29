#!/usr/bin/env pwsh
# ISU Groundstation - Quick Deploy Script (PowerShell)
# Pushes code to GitHub and prepares for Render deployment

Write-Host @"
============================================
  ISU Groundstation - GitHub Deployment
============================================
"@ -ForegroundColor Cyan

# Step 1: Get GitHub username
$gitHubUser = Read-Host "Enter your GitHub username"

# Step 2: Configure Git
Write-Host "`nConfiguring Git..." -ForegroundColor Yellow
git config --global user.email "dev@isu.space"
git config --global user.name $gitHubUser

# Step 3: Set up remote
Write-Host "Setting up GitHub remote..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin "https://github.com/$gitHubUser/isu_groundstation.git"

# Step 4: Push to GitHub
Write-Host "`nPushing to GitHub..." -ForegroundColor Yellow
Write-Host "Note: You'll be prompted for GitHub credentials or personal access token" -ForegroundColor Gray
Write-Host ""

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host @"

============================================
  SUCCESS! Code is on GitHub!
============================================

Next steps:

1. Visit https://render.com
2. Sign in with GitHub
3. Click 'New +' → 'Web Service'
4. Select 'isu_groundstation' repo
5. Configure:
   • Build: pip install -r requirements.txt
   • Start: python app.py
   • Plan: Free
6. Add environment variables:
   • GS_LATITUDE = 48.5233
   • GS_LONGITUDE = 7.7369
   • FLASK_HOST = 0.0.0.0
7. Click 'Create Web Service'

Your app will be live in 2-3 minutes!

GitHub: https://github.com/$gitHubUser/isu_groundstation
"@ -ForegroundColor Green
} else {
    Write-Host "ERROR: Push failed. Check your credentials and network connection." -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to exit"
