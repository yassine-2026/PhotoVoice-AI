import os
import uuid
import shutil
import threading
import subprocess
import glob
import json
from typing import Dict, Any

jobs: Dict[str, Dict[str, Any]] = {}
SADTALKER_DIR = os.getenv("SADTALKER_DIR", "/app/SadTalker")
INFERENCE_SCRIPT = os.path.join(SADTALKER_DIR, "inference.py")

def create_job() -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "created",
        "message": "Job created",
        "progress": 0,
        "result_video": None
    }
    
    # Create temp directories for this job
    job_dir = os.path.join("temp", job_id)
    os.makedirs(job_dir, exist_ok=True)
    return job_id

def get_job_status(job_id: str) -> Dict[str, Any]:
    return jobs.get(job_id)

def update_job(job_id: str, status: str, message: str, progress: int = None):
    if job_id in jobs:
        jobs[job_id]["status"] = status
        jobs[job_id]["message"] = message
        if progress is not None:
            jobs[job_id]["progress"] = progress

def validate_audio(file_path: str) -> tuple[bool, str]:
    try:
        cmd = [
            "ffprobe", "-v", "error", 
            "-show_entries", "stream=codec_type,duration",
            "-of", "json", file_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return False, "ffprobe failed"
        
        info = json.loads(result.stdout)
        streams = info.get("streams", [])
        has_audio = any(s.get("codec_type") == "audio" for s in streams)
        if not has_audio:
            return False, "No audio stream found"
        return True, "Valid"
    except Exception as e:
        return False, str(e)

def validate_video(file_path: str) -> tuple[bool, str]:
    try:
        cmd = [
            "ffprobe", "-v", "error", 
            "-show_entries", "stream=codec_type",
            "-of", "json", file_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            return False, "ffprobe failed on video"
        
        info = json.loads(result.stdout)
        streams = info.get("streams", [])
        has_video = any(s.get("codec_type") == "video" for s in streams)
        if not has_video:
            return False, "No video stream found in output"
        return True, "Valid"
    except Exception as e:
        return False, str(e)

def process_job_sync(job_id: str):
    job_dir = os.path.join("temp", job_id)
    image_path = os.path.join(job_dir, "input_image")
    audio_path = os.path.join(job_dir, "input_audio")
    
    try:
        # Validate Audio
        update_job(job_id, "validating", "Validating audio...", 10)
        valid_aud, aud_msg = validate_audio(audio_path)
        if not valid_aud:
            update_job(job_id, "failed", f"Audio validation failed: {aud_msg}", 10)
            return

        # Prepare outputs
        sadtalker_output = os.path.join(job_dir, "output")
        os.makedirs(sadtalker_output, exist_ok=True)

        update_job(job_id, "generating", "Running SadTalker inference...", 30)
        
        # Run SadTalker using subprocess with list of arguments
        cmd = [
            "python3", INFERENCE_SCRIPT,
            "--driven_audio", os.path.abspath(audio_path),
            "--source_image", os.path.abspath(image_path),
            "--result_dir", os.path.abspath(sadtalker_output),
            "--still",
            "--preprocess", "crop"
        ]
        
        process = subprocess.run(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True, 
            cwd=SADTALKER_DIR
        )

        if process.returncode != 0:
            print("SadTalker stderr:", process.stderr)
            update_job(job_id, "failed", f"SadTalker process failed. See logs.", 80)
            return

        # Find the generated video
        mp4_files = glob.glob(os.path.join(sadtalker_output, "*.mp4"))
        if not mp4_files:
            update_job(job_id, "failed", "SadTalker succeeded but no MP4 was generated", 90)
            return
            
        generated_video_path = mp4_files[0]
        
        # Validate the generated video
        update_job(job_id, "validating_video", "Validating generated video...", 95)
        valid_vid, vid_msg = validate_video(generated_video_path)
        if not valid_vid:
            update_job(job_id, "failed", "Generated video is invalid", 95)
            return

        # Move to final outputs
        final_dir = os.path.join("outputs", job_id)
        os.makedirs(final_dir, exist_ok=True)
        final_video_path = os.path.join(final_dir, "final.mp4")
        shutil.copy(generated_video_path, final_video_path)

        jobs[job_id]["result_video"] = final_video_path
        update_job(job_id, "completed", "Video generated successfully", 100)

    except Exception as e:
        update_job(job_id, "failed", f"Unexpected error: {str(e)}", 0)

def process_job_async(job_id: str):
    thread = threading.Thread(target=process_job_sync, args=(job_id,))
    thread.daemon = True
    thread.start()
