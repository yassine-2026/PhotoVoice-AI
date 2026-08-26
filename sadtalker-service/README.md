# SadTalker Python Service

This is a standalone FastAPI service designed to run the official [SadTalker](https://github.com/OpenTalker/SadTalker) model. It exposes a set of REST APIs to generate talking head videos from an image and an audio file.

## Architecture

This service handles the heavy lifting of running PyTorch and FFmpeg locally. It is intended to be deployed on a GPU-enabled machine (like AWS EC2 with GPU, RunPod, or Lambda Cloud). 

It connects to the main Node.js Server in the frontend.

## Deployment

1. **Prerequisites**: A Linux machine with an NVIDIA GPU and Docker installed with NVIDIA Container Toolkit.
2. **Build**:
   ```bash
   docker build -t sadtalker-service .
   ```
3. **Run**:
   ```bash
   docker run --gpus all -p 8000:8000 sadtalker-service
   ```

Once deployed, you will get an IP or Domain (e.g., `http://203.0.113.50:8000`).

## Environment Configuration

After deploying this service successfully, take the deployment URL and add it to the Google AI Studio project environment variables:

`SADTALKER_API_URL=http://your-gpu-server-ip:8000`

## API Endpoints

- `GET /health` : Checks system dependencies (ffmpeg, python, sadtalker code).
- `POST /generate` : Upload `image` and `audio` form files, returns `{ "job_id": "uuid" }`.
- `GET /status/{job_id}` : Returns current generation status.
- `GET /video/{job_id}` : Streams the final `.mp4` file.
- `DELETE /job/{job_id}` : Cleans up temporary resources.
