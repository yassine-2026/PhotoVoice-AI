import os
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from app.job_manager import create_job, get_job_status, process_job_async
import subprocess

app = FastAPI()

# Make sure base directories exist
os.makedirs("temp", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

SADTALKER_DIR = os.getenv("SADTALKER_DIR", "/app/SadTalker")

@app.get("/health")
def health_check():
    health_data = {
        "python": True,
        "ffmpeg": False,
        "ffprobe": False,
        "sadtalker_dir": False,
        "inference_py": False,
        "pytorch": False,
        "checkpoints": False,
        "ready": False
    }

    try:
        if subprocess.run(["which", "ffmpeg"], stdout=subprocess.PIPE).returncode == 0:
            health_data["ffmpeg"] = True
        if subprocess.run(["which", "ffprobe"], stdout=subprocess.PIPE).returncode == 0:
            health_data["ffprobe"] = True
    except:
        pass

    try:
        import torch
        health_data["pytorch"] = True
    except ImportError:
        pass

    if os.path.exists(SADTALKER_DIR) and os.path.isdir(SADTALKER_DIR):
        health_data["sadtalker_dir"] = True
        if os.path.exists(os.path.join(SADTALKER_DIR, "inference.py")):
            health_data["inference_py"] = True
        
        # Check checkpoints (at least mapping and one model)
        ckpt_dir = os.path.join(SADTALKER_DIR, "checkpoints")
        if os.path.exists(ckpt_dir) and os.path.isdir(ckpt_dir):
            files = os.listdir(ckpt_dir)
            if any(f.endswith(".pth.tar") or f.endswith(".safetensors") for f in files):
                health_data["checkpoints"] = True

    if all([
        health_data["ffmpeg"], 
        health_data["ffprobe"], 
        health_data["sadtalker_dir"], 
        health_data["inference_py"],
        health_data["pytorch"],
        health_data["checkpoints"]
    ]):
        health_data["ready"] = True

    return health_data

@app.post("/generate")
async def generate_video(
    image: UploadFile = File(...),
    audio: UploadFile = File(...)
):
    if not image or not audio:
        raise HTTPException(status_code=400, detail="Missing image or audio")

    # Quick check if system is ready
    if not health_check()["ready"]:
        raise HTTPException(status_code=503, detail="Service is not ready (missing dependencies or SadTalker)")

    job_id = create_job()
    job_dir = os.path.join("temp", job_id)

    image_path = os.path.join(job_dir, "input_image")
    audio_path = os.path.join(job_dir, "input_audio")

    with open(image_path, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    with open(audio_path, "wb") as buffer:
        shutil.copyfileobj(audio.file, buffer)

    # Start processing in background
    process_job_async(job_id)

    return {"job_id": job_id, "status": "queued"}

@app.get("/status/{job_id}")
def status(job_id: str):
    job = get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Don't leak the exact file path to the client
    response = {k: v for k, v in job.items() if k != "result_video"}
    return response

@app.get("/video/{job_id}")
def get_video(job_id: str):
    job = get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("status") != "completed" or not job.get("result_video"):
        raise HTTPException(status_code=400, detail="Video not ready yet")
        
    video_path = job["result_video"]
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video file missing from server")
        
    return FileResponse(video_path, media_type="video/mp4", filename=f"photovoice_{job_id}.mp4")

@app.delete("/job/{job_id}")
def delete_job(job_id: str):
    job_dir = os.path.join("temp", job_id)
    out_dir = os.path.join("outputs", job_id)
    
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir)
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
        
    return {"success": True, "message": f"Job {job_id} resources cleaned up"}
