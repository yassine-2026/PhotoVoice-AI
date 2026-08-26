import 'dotenv/config';
import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import sharp from 'sharp';
import cors from 'cors';
import FormData from 'form-data';
import fetch from 'node-fetch'; // Requires node-fetch or use native fetch if Node >= 18

// Initialize Face Detection
import * as tf from '@tensorflow/tfjs-node';
import * as faceapi from '@vladmandic/face-api';

const MODELS_URL = path.join(process.cwd(), 'models');
let faceDetectionAvailable = false;
faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_URL).then(() => {
    faceDetectionAvailable = true;
    console.log("Face API models loaded successfully");
}).catch(err => {
    console.error("Failed to load Face API models", err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}
const upload = multer({ dest: tempDir });

// 1. Health API
app.get('/api/health', async (req, res) => {
    const ffmpegCheck = spawnSync('which', ['ffmpeg']);
    const hasFfmpeg = ffmpegCheck.status === 0;
    
    const sadTalkerUrl = process.env.SADTALKER_API_URL;
    let sadTalkerReady = false;
    
    if (sadTalkerUrl) {
        try {
            const stRes = await fetch(`${sadTalkerUrl}/health`);
            if (stRes.ok) {
                const stData = await stRes.json();
                if (stData.ready) {
                    sadTalkerReady = true;
                }
            }
        } catch (e) {
            sadTalkerReady = false;
        }
    }

    res.json({
        server: true,
        image_processing: true,
        face_detection: faceDetectionAvailable,
        ffmpeg: hasFfmpeg,
        sadtalker: sadTalkerReady,
        ready_for_generation: sadTalkerReady
    });
});

// 2. Upload Image
app.post('/api/upload/image', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    
    try {
        const metadata = await sharp(req.file.path).metadata();
        if (!metadata.width || !metadata.height) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Invalid image dimensions' });
        }
        
        // Actual Face Detection
        try {
            const imgBuffer = await fs.promises.readFile(req.file.path);
            const decoded = tf.node.decodeImage(imgBuffer, 3);
            const detection = await faceapi.detectSingleFace(decoded as any);
            tf.dispose(decoded);
            
            if (!detection) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'No face detected in the uploaded image. Please provide a clear face image.' });
            }
        } catch (e) {
            console.error("Face detection error:", e);
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Failed to process image for face detection.' });
        }
        
        res.json({ 
            success: true, 
            fileId: req.file.filename,
            path: req.file.path,
            metadata: { width: metadata.width, height: metadata.height, format: metadata.format }
        });
    } catch (error) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(400).json({ error: 'Invalid or corrupted image' });
    }
});

// 3. Upload Audio
app.post('/api/upload/audio', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio uploaded' });
    
    if (req.file.size === 0) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Empty audio file' });
    }
    
    res.json({ success: true, fileId: req.file.filename, path: req.file.path });
});

// 4. Generate Video
app.post('/api/generate', async (req, res) => {
    const { imagePath, audioPath } = req.body; // expecting absolute paths from upload response
    
    if (!imagePath || !audioPath) return res.status(400).json({ error: 'Missing image or audio path' });
    
    const sadTalkerUrl = process.env.SADTALKER_API_URL;
    if (!sadTalkerUrl) {
        return res.status(400).json({ error: 'SadTalker Service is not connected. Generation unavailable.' });
    }
    
    try {
        const formData = new FormData();
        formData.append('image', fs.createReadStream(imagePath));
        formData.append('audio', fs.createReadStream(audioPath));
        
        const response = await fetch(`${sadTalkerUrl}/generate`, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`SadTalker API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        res.json(data); // Returns { "job_id": "...", "status": "queued" }
    } catch (error: any) {
        console.error("Error communicating with SadTalker:", error.message);
        res.status(500).json({ error: "Failed to communicate with Python SadTalker Service." });
    }
});

// 5. Job Status
app.get('/api/status/:jobId', async (req, res) => {
    const sadTalkerUrl = process.env.SADTALKER_API_URL;
    if (!sadTalkerUrl) return res.status(400).json({ error: 'SadTalker Service not connected' });
    
    try {
        const response = await fetch(`${sadTalkerUrl}/status/${req.params.jobId}`);
        if (!response.ok) {
            return res.status(response.status).json({ error: 'Job not found in SadTalker Service' });
        }
        const data = await response.json();
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: "Failed to fetch status" });
    }
});

// 6. Get Video
app.get('/api/video/:jobId', async (req, res) => {
    const sadTalkerUrl = process.env.SADTALKER_API_URL;
    if (!sadTalkerUrl) return res.status(400).json({ error: 'SadTalker Service not connected' });
    
    try {
        const response = await fetch(`${sadTalkerUrl}/video/${req.params.jobId}`);
        if (!response.ok) {
            return res.status(response.status).send('Video not found or not ready');
        }
        
        // Proxy the stream
        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        response.body.pipe(res);
    } catch (error: any) {
        res.status(500).send("Error streaming video");
    }
});

async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
            root: path.join(process.cwd(), 'frontend')
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'frontend', 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Node.js API Server running on http://0.0.0.0:${PORT}`);
    });
}

startServer();
