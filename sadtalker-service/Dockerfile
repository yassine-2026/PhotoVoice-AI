FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Install basic requirements and python
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    ffmpeg \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Clone SadTalker (we will use this directory internally)
RUN git clone https://github.com/OpenTalker/SadTalker.git /app/SadTalker

# Install SadTalker requirements
WORKDIR /app/SadTalker
# Important: ensure PyTorch matches CUDA 11.8
RUN pip3 install --no-cache-dir torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
RUN pip3 install --no-cache-dir -r requirements.txt

# Download model checkpoints (Simplified for Docker, standard script from SadTalker)
# You may need to mount checkpoints via volume if downloading fails or takes too long
RUN bash scripts/download_models.sh

# Now setup our API service
WORKDIR /service
COPY requirements.txt /service/
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy our service code
COPY app /service/app

# Set env var for SadTalker path
ENV SADTALKER_DIR="/app/SadTalker"

EXPOSE 8000

# Start FastAPI server
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
