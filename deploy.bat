@echo off
REM ISU Groundstation - Quick Deploy Script
REM This script pushes your code to GitHub and deploys to Render

echo.
echo ============================================
echo  ISU Groundstation - GitHub Deployment
echo ============================================
echo.

REM Step 1: Ask for GitHub username
set /p GITHUB_USER="Enter your GitHub username: "

REM Step 2: Check Git configuration
echo.
echo Checking Git configuration...
git config --global user.name >nul 2>&1
if %errorlevel% neq 0 (
    echo Git not configured. Setting up...
    git config --global user.email "dev@isu.space"
    git config --global user.name "%GITHUB_USER%"
)

REM Step 3: Create remote
echo.
echo Setting up GitHub remote...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/%GITHUB_USER%/isu_groundstation.git

REM Step 4: Push to GitHub
echo.
echo Pushing code to GitHub...
echo Note: You'll be prompted to enter your GitHub credentials/token
echo.
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo  SUCCESS! Your code is on GitHub!
    echo ============================================
    echo.
    echo Next step:
    echo 1. Go to https://render.com
    echo 2. Sign up with GitHub
    echo 3. Create new Web Service
    echo 4. Select isu_groundstation repository
    echo.
    echo Configure with:
    echo   Build: pip install -r requirements.txt
    echo   Start: python app.py
    echo   Plan: Free
    echo.
    echo Your app will be live in 2-3 minutes!
    echo.
) else (
    echo.
    echo ERROR: Push failed. Check your credentials and try again.
    echo.
)

pause
