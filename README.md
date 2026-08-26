# PhotoVoice AI

"حوّل صورة إلى شخصية متحركة تتكلم باستخدام ملف صوتي."

This is a production-ready application that integrates React Frontend with a real Python FastAPI Backend running SadTalker, FFmpeg, and OpenCV.

## Architecture

* **Frontend**: React, Vite, TypeScript, TailwindCSS.
* **Backend**: Python 3, FastAPI, Uvicorn, FFmpeg, ffprobe, Pillow, OpenCV.
* **Proxy/Deployment**: Node.js Express acts as a proxy for the FastAPI backend and serves static Vite build.

## Prerequisites

1. **Python 3.10+**
2. **Node.js 20+**
3. **FFmpeg** and **ffprobe** installed and available in system PATH.
4. **SadTalker** installed at `/app/SadTalker` (or modify `backend/app/providers/sadtalker.py`).
5. **Model Checkpoints** inside `/app/SadTalker/checkpoints`.

## Environment Setup

Create `.env` files in both the root and `frontend/` directories if needed.

For the Frontend to locate the backend, set:
```
VITE_API_URL=http://your-backend-domain.com
```
*(If running the built-in Node proxy, this can be left blank, it will default to relative `/api`)*

## Local Development

```bash
npm install
npm run dev
```
This runs Vite on Port 3000 and FastAPI on Port 8765 concurrently.

## Production Start

```bash
npm run build
npm start
```
This launches Express on Port 3000 (serving static files and proxying API) and boots FastAPI on Port 8765.

## Health API Check

Navigate to `/api/health` to verify all components (FFmpeg, SadTalker, Models, GPU). If something is missing, the application will display a warning and graceful degradation behavior.

## GPU Requirements

SadTalker requires a GPU for fast generation. The API Health check validates if `torch.cuda.is_available()` is true. CPU execution is possible but extremely slow.

## CORS Issues

CORS is handled automatically by the FastAPI middleware, allowing all origins. If separating Frontend and Backend on different domains, configure the `allow_origins` array in `backend/app/main.py` explicitly to the Frontend URL.
