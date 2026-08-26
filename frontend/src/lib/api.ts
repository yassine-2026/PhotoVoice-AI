// VITE_API_URL should be set in production to point to the backend domain.
// In dev, Vite proxies /api so we can just use /api
const API_URL = import.meta.env.VITE_API_URL || '';

export interface HealthResponse {
  server: boolean;
  image_processing: boolean;
  face_detection: boolean;
  ffmpeg: boolean;
  sadtalker: boolean;
  ready_for_generation: boolean;
}

export const checkHealth = async (retries = 3, delay = 2000): Promise<HealthResponse> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`${API_URL}/api/health`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      if (i === retries - 1) {
        console.error('Health check failed after retries:', error);
      } else {
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  return {
    server: false,
    image_processing: false,
    face_detection: false,
    ffmpeg: false,
    sadtalker: false,
    ready_for_generation: false,
  };
};
