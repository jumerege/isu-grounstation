# Deployment Guide - ISU Groundstation

This guide explains how to deploy the ISU Groundstation Flask app to the internet.

## Option 1: Deploy to Render (Recommended - Free)

Render offers free tier hosting for Flask apps with good performance.

### Steps:

1. **Create GitHub Repository**
   ```bash
   cd C:\Users\jumer\Downloads\groundstation_app
   git init
   git add .
   git commit -m "Initial commit: ISU Groundstation Flask app"
   git branch -M main
   ```

2. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/yourusername/isu_groundstation.git
   git push -u origin main
   ```

3. **Deploy to Render**
   - Go to https://render.com and sign up
   - Click "New +" → "Web Service"
   - Connect your GitHub account
   - Select `isu_groundstation` repository
   - Configure:
     - **Name**: isu-groundstation
     - **Environment**: Python 3
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `python app.py`
     - **Plan**: Free

4. **Add Environment Variables**
   - In Render dashboard, go to your service
   - Click "Environment"
   - Add variables from `.env.example`:
     ```
     GS_NAME=ISU Groundstation
     GS_LATITUDE=48.5233
     GS_LONGITUDE=7.7369
     GS_ALTITUDE_M=143
     FLASK_HOST=0.0.0.0
     FLASK_PORT=5000
     ```

5. **Deploy**
   - Render auto-deploys when you push to GitHub
   - Your app will be live at: `https://isu-groundstation.onrender.com`

## Option 2: Deploy to Railway

Railway is another excellent free option.

### Steps:

1. Go to https://railway.app
2. Click "Start Project" → "Deploy from GitHub"
3. Select your repository
4. Railway auto-detects Python/Flask
5. Add environment variables
6. Your app will be live at: `https://yourproject.railway.app`

## Option 3: Deploy to Heroku

Heroku is phasing out free tier, but you can use paid options.

### Steps:

1. Install Heroku CLI
2. Create Heroku account
3. Run:
   ```bash
   heroku login
   heroku create isu-groundstation
   git push heroku main
   ```

## Option 4: Docker + Cloud Run (Google)

Deploy as a Docker container to Google Cloud Run.

1. **Create Dockerfile**
   ```dockerfile
   FROM python:3.11-slim
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install -r requirements.txt
   COPY . .
   CMD ["python", "app.py"]
   ```

2. **Build and Push**
   ```bash
   docker build -t isu-groundstation .
   docker tag isu-groundstation gcr.io/your-project/isu-groundstation
   docker push gcr.io/your-project/isu-groundstation
   ```

3. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy isu-groundstation \
     --image gcr.io/your-project/isu-groundstation \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

## Testing Your Deployment

1. Visit your deployed URL
2. Click "Mock" checkbox
3. Click "Connect"
4. Click "📷 Take Picture" to test camera
5. Verify sensor graphs update

## Troubleshooting

### Port not available
- Render/Railway set `PORT` automatically
- App reads from environment: `int(os.getenv("FLASK_PORT", "5000"))`

### Dependencies missing
- Verify `requirements.txt` has all packages
- Run locally: `pip install -r requirements.txt`

### Environment variables not loading
- Check `.env` file exists locally
- Verify all vars are set in hosting dashboard
- Use `.env.example` as reference

### ISS widget not loading
- N2YO widget requires internet connection
- Verify domain is not blocked
- Check browser console for CORS errors

## Next Steps

After deployment:

1. **Configure Serial Port** (if using hardware)
   - Find COM port of your ESP32
   - Update Docker environment or Render config

2. **Enable HTTPS**
   - Render/Railway provide free SSL
   - Verify it's enabled in settings

3. **Custom Domain** (Optional)
   - Add custom domain in hosting dashboard
   - Update DNS records

4. **Monitoring**
   - Check logs in hosting dashboard
   - Set up error alerts

## Production Checklist

- [ ] `.env` file not committed to Git
- [ ] `requirements.txt` has all dependencies
- [ ] `Procfile` is correct
- [ ] `README.md` is updated
- [ ] Environment variables configured in hosting
- [ ] HTTPS is enabled
- [ ] Mock mode works
- [ ] ISS tracking widget loads
- [ ] Sensor graphs display (with mock data)

## Questions?

See `README.md` for API documentation and features.
