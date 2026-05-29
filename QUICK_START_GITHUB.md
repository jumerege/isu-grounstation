# 🚀 Quick GitHub Deployment Guide

Your ISU Groundstation app is ready to deploy! Follow these simple steps:

## 1. Create GitHub Repository

```bash
# Go to https://github.com/new and create a new repository
# Name it: isu_groundstation
# Description: Live ISS tracking and ground station dashboard
# Make it PUBLIC (for GitHub Pages)
```

## 2. Push Code to GitHub

```bash
cd C:\Users\jumer\Downloads\groundstation_app

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/isu_groundstation.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## 3. Deploy to Render.com (Recommended - Takes 5 minutes)

### Best Option: Free hosting with auto-deployment

1. **Go to** https://render.com
2. **Sign up** with GitHub
3. **Click** "New +" → "Web Service"
4. **Select** your `isu_groundstation` repository
5. **Configure:**
   - Name: `isu-groundstation`
   - Environment: `Python 3`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python app.py`
   - Instance Type: `Free`

6. **Add Environment Variables:**
   - Click "Add Environment Variable"
   - Copy from `.env.example`:
     ```
     GS_NAME = ISU Groundstation
     GS_LATITUDE = 48.5233
     GS_LONGITUDE = 7.7369
     GS_ALTITUDE_M = 143
     FLASK_HOST = 0.0.0.0
     FLASK_PORT = 5000
     ```

7. **Deploy** - Click "Create Web Service"
8. **Wait** ~2-3 minutes for build
9. **Your app is live!** Example URL: `https://isu-groundstation.onrender.com`

## 4. Alternative: Deploy to Railway.app

1. Go to https://railway.app
2. Click "Start New Project"
3. Select "Deploy from GitHub repo"
4. Authorize and select `isu_groundstation`
5. Railway auto-configures Python/Flask
6. Add environment variables
7. Deploy automatically

**Your app URL:** `https://yourproject.railway.app`

## 5. Test Your Deployment

Once deployed:

1. **Visit** your live URL
2. **Click** "Mock" checkbox (enables test mode)
3. **Click** "Connect" button
4. **Observe:**
   - ✅ ISS tracking map loads
   - ✅ ISS pass table shows (like your attachment)
   - ✅ Sensor graph placeholders appear
   - ✅ Mock button changes to "Disconnect"

## What's Included in Your Deployment

✨ **Live Features:**
- Real-time ISS tracking with N2YO widget
- ISS pass prediction table (the table you wanted!)
- Ground station location display
- Mock telemetry data
- Responsive mobile design
- Dark theme with space aesthetics

🔧 **Backend Capabilities:**
- Flask REST API for serial communication
- Image capture and processing
- Sensor telemetry collection
- Configurable refresh rates

## Project Files

```
groundstation_app/
├── app.py                 # Flask backend
├── gs_serial.py           # Serial/hardware interface
├── requirements.txt       # Python dependencies
├── Procfile               # Deployment config
├── .env.example           # Environment template
├── README.md              # Full documentation
├── DEPLOYMENT.md          # Detailed deployment guide
├── templates/
│   └── index.html         # Dashboard UI
└── static/
    ├── app.js             # Frontend logic
    ├── style.css          # Modern styling
    └── isu_logo.png       # ISU branding
```

## Next Steps

### Local Development
```bash
# To keep testing locally
python app.py
# Visit http://127.0.0.1:5000
```

### Connect Hardware (Optional)
If you have ESP32/XBee hardware:
1. Remove "Mock" checkbox
2. Enter serial port (e.g., COM15)
3. Click "Connect"
4. Live data flows automatically

### Custom Domain (Optional)
In Render dashboard:
1. Go to Settings
2. Add Custom Domain
3. Update DNS records (instructions provided)

## Troubleshooting

**App shows "Service not available"**
- Wait 5 minutes for initial deployment
- Check Render/Railway dashboard logs

**ISS map not loading**
- Click browser refresh
- Check internet connection
- Verify no browser extensions block iframes

**Need to update code?**
- Make changes locally
- Commit: `git commit -am "Update description"`
- Push: `git push origin main`
- Render/Railway auto-deploys in ~2 minutes

## Support

📖 See `README.md` for:
- API documentation
- Feature details
- Hardware setup guide

📝 See `DEPLOYMENT.md` for:
- Alternative hosting options
- Docker deployment
- Production checklist

## Success! 🎉

Your ISU Groundstation is now:
- ✅ Running locally at `http://127.0.0.1:5000`
- ✅ Deployed online (via Render/Railway)
- ✅ Ready for ISS tracking missions
- ✅ Showing live ISS pass predictions table

**Share the link with your team!** 🚀
