import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Download, AlertCircle, Loader2 } from 'lucide-react';
import { checkHealth, HealthResponse } from './lib/api';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  
  useEffect(() => {
    checkHealth().then(setHealth);
  }, []);
  
  useEffect(() => {
    let interval: any;
    if (jobId && jobStatus?.status !== 'completed' && jobStatus?.status !== 'failed') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/status/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            setJobStatus(data);
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, jobStatus]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setAudioPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!imageFile || !audioFile) return;
    
    setJobStatus({ status: 'queued', message: 'جاري رفع الملفات...', progress: 5 });

    try {
      // 1. Upload Image
      const imgFormData = new FormData();
      imgFormData.append('image', imageFile);
      const imgRes = await fetch(`${API_URL}/api/upload/image`, {
        method: 'POST',
        body: imgFormData,
      });
      if (!imgRes.ok) throw new Error('فشل رفع الصورة');
      const imgData = await imgRes.json();
      
      // 2. Upload Audio
      const audFormData = new FormData();
      audFormData.append('audio', audioFile);
      const audRes = await fetch(`${API_URL}/api/upload/audio`, {
        method: 'POST',
        body: audFormData,
      });
      if (!audRes.ok) throw new Error('فشل رفع الصوت');
      const audData = await audRes.json();

      setJobStatus({ status: 'queued', message: 'جاري إرسال الطلب إلى خادم SadTalker...', progress: 10 });

      // 3. Generate
      const genRes = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: imgData.path, audioPath: audData.path }),
      });
      
      if (genRes.ok) {
        const genData = await genRes.json();
        setJobId(genData.job_id);
      } else {
        const errorText = await genRes.text();
        setJobStatus({ status: 'failed', message: `خطأ من الخادم: ${errorText}`, progress: 0 });
      }
    } catch (e: any) {
      setJobStatus({ status: 'failed', message: e.message || 'خطأ في الشبكة', progress: 0 });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <header className="text-center py-8 border-b border-slate-800">
          <h1 className="text-4xl font-bold mb-3 tracking-tight">PhotoVoice AI</h1>
          <p className="text-slate-400">حوّل صورتك إلى شخصية تتحدث بصوتك الحقيقي</p>
        </header>

        {!health?.ready_for_generation && health?.server && (
          <div className="bg-amber-950/40 border border-amber-900/50 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-amber-500 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-500">النظام يعمل في وضع محدود</h3>
              <p className="text-amber-400/80 text-sm mt-1">تفتقد البيئة إلى الاتصال بمحرك SadTalker. سيتم رفض العملية في الواجهة الخلفية ولن يتم إنشاء فيديو وهمي.</p>
            </div>
          </div>
        )}
        
        {!health?.server && (
           <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-red-500 shrink-0" />
            <div>
              <h3 className="font-semibold text-red-500">جاري الاتصال بالخادم...</h3>
              <p className="text-red-400/80 text-sm mt-1">الرجاء الانتظار ريثما يستجيب الخادم.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Image Upload */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">📷 صورة الشخصية</h2>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-square">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button onClick={() => {setImageFile(null); setImagePreview(null);}} className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 text-white px-3 py-1.5 rounded-lg text-sm backdrop-blur transition-colors">تغيير الصورة</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full aspect-square rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 hover:bg-slate-800/50 transition-colors cursor-pointer bg-slate-950">
                <Upload className="w-10 h-10 text-slate-500 mb-3" />
                <span className="text-slate-400 font-medium">اضغط لرفع صورة</span>
                <span className="text-slate-500 text-sm mt-1">JPG, PNG, WebP</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            )}
          </div>

          {/* Audio Upload */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col">
            <h2 className="text-xl font-semibold mb-4">🎤 الملف الصوتي</h2>
            {audioPreview ? (
              <div className="flex-1 flex flex-col justify-center items-center bg-slate-950 rounded-xl border border-slate-800 p-6 relative">
                <audio controls src={audioPreview} className="w-full mb-4" />
                <button onClick={() => {setAudioFile(null); setAudioPreview(null);}} className="text-slate-400 hover:text-white transition-colors text-sm">تغيير الملف الصوتي</button>
              </div>
            ) : (
              <label className="flex-1 flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 hover:bg-slate-800/50 transition-colors cursor-pointer bg-slate-950">
                <Upload className="w-10 h-10 text-slate-500 mb-3" />
                <span className="text-slate-400 font-medium">اضغط لرفع ملف صوتي</span>
                <span className="text-slate-500 text-sm mt-1">MP3, WAV, M4A</span>
                <input type="file" accept="audio/*" className="hidden" onChange={handleAudioChange} />
              </label>
            )}
          </div>
        </div>

        {/* Generate Button & Progress */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          {!jobId ? (
            <button
              onClick={handleSubmit}
              disabled={!imageFile || !audioFile}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold py-4 rounded-xl transition-colors text-lg flex justify-center items-center gap-2"
            >
              إنشاء الفيديو
            </button>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">حالة الطلب</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${jobStatus?.status === 'completed' ? 'bg-green-500/10 text-green-500' : jobStatus?.status === 'failed' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                  {jobStatus?.status === 'failed' ? 'فشل' : jobStatus?.status === 'completed' ? 'مكتمل' : 'جاري المعالجة...'}
                </span>
              </div>
              
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-sm text-slate-300">
                <div className="flex gap-3 items-center">
                  {jobStatus?.status !== 'completed' && jobStatus?.status !== 'failed' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  <span>{jobStatus?.message || "جاري الاتصال بالخادم..."}</span>
                </div>
              </div>
              
              {jobStatus?.progress > 0 && (
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-500 ease-out" style={{ width: `${jobStatus.progress}%` }}></div>
                </div>
              )}

              {jobStatus?.status === 'completed' && (
                <div className="mt-8 pt-8 border-t border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <h3 className="font-semibold text-xl mb-4 text-green-400">✓ الفيديو جاهز!</h3>
                  <div className="rounded-xl overflow-hidden border border-slate-700 bg-black aspect-video mb-4 relative">
                    <video 
                      controls 
                      className="w-full h-full"
                      src={`${API_URL}/api/video/${jobId}`}
                    />
                  </div>
                  <a 
                    href={`${API_URL}/api/video/${jobId}`}
                    download={`photovoice_${jobId}.mp4`}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    تحميل الفيديو
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
