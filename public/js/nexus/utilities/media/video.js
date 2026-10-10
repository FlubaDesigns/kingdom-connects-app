/**
 * Nexus Video Utilities
 * Video-specific creation, thumbnail extraction, and testing tools
 * 
 * TOOLBOX INDEX: /js/nexus/NEXUS-INDEX.md
 */
import { MediaCommon } from './common.js';

export const VideoTools = {
  createTestVideo(options = {}) {
    return new Promise((resolve, reject) => {
      const width = options.width || 64;
      const height = options.height || 64;
      const frames = options.frames || 15;
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const file = new File([blob], `nexus-video-test-${Date.now()}.webm`, { type: 'video/webm' });
        resolve(file);
      };
      recorder.onerror = reject;
      
      recorder.start();
      
      let frame = 0;
      const animate = () => {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, `hsl(${frame * 10}, 70%, 50%)`);
        gradient.addColorStop(1, `hsl(${frame * 10 + 60}, 70%, 30%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TEST', width / 2, height / 2 - 5);
        ctx.font = '10px Arial';
        ctx.fillText('VIDEO', width / 2, height / 2 + 10);
        frame++;
        if (frame < frames) {
          requestAnimationFrame(animate);
        } else {
          recorder.stop();
        }
      };
      animate();
    });
  },

  extractThumbnail(videoFile, seekTime = 0.1) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const videoUrl = URL.createObjectURL(videoFile);
      
      video.onloadeddata = () => {
        video.currentTime = seekTime;
      };
      
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 64;
          canvas.height = video.videoHeight || 64;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(videoUrl);
            if (blob) {
              const thumbFile = new File([blob], `thumb-${Date.now()}.png`, { type: 'image/png' });
              const thumbUrl = URL.createObjectURL(thumbFile);
              resolve({ 
                file: thumbFile, 
                url: thumbUrl, 
                width: canvas.width, 
                height: canvas.height,
                size: blob.size
              });
            } else {
              reject(new Error('Failed to create thumbnail blob'));
            }
          }, 'image/png');
        } catch (err) {
          URL.revokeObjectURL(videoUrl);
          reject(err);
        }
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(videoUrl);
        reject(new Error('Failed to load video for thumbnail extraction'));
      };
      
      video.src = videoUrl;
      video.load();
    });
  },

  validateVideo(file, options = {}) {
    const maxSize = options.maxSize || 50 * 1024 * 1024;
    const allowedTypes = options.allowedTypes || ['video/mp4', 'video/webm'];
    return MediaCommon.validateFile(file, { maxSize, allowedTypes });
  },

  async getVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({ 
          duration: video.duration, 
          width: video.videoWidth, 
          height: video.videoHeight 
        });
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video metadata'));
      };
      
      video.src = url;
    });
  },

  async runFullTest(options = {}) {
    const results = {
      status: 'pending',
      checks: [],
      startTime: Date.now()
    };
    
    const basePath = options.basePath || '_kc_healthchecks/video-test';
    let videoPath = null;
    let thumbPath = null;
    
    try {
      const videoFile = await this.createTestVideo();
      results.checks.push({ 
        name: 'create-video', 
        status: 'pass', 
        details: `${videoFile.size} bytes WebM` 
      });
      
      const thumbnail = await this.extractThumbnail(videoFile);
      results.checks.push({ 
        name: 'extract-thumbnail', 
        status: 'pass', 
        details: `${thumbnail.width}x${thumbnail.height} PNG, ${thumbnail.size} bytes` 
      });
      
      videoPath = `${basePath}/${Date.now()}.webm`;
      await MediaCommon.uploadWithProgress(videoFile, videoPath, options.onVideoProgress);
      results.checks.push({ 
        name: 'upload-video', 
        status: 'pass', 
        details: `${videoFile.size} bytes uploaded` 
      });
      
      thumbPath = `${basePath}/${Date.now()}-thumb.png`;
      await MediaCommon.uploadWithProgress(thumbnail.file, thumbPath, options.onThumbProgress);
      results.checks.push({ 
        name: 'upload-thumbnail', 
        status: 'pass', 
        details: `${thumbnail.size} bytes uploaded` 
      });
      
      const videoInfo = await MediaCommon.getFileInfo(videoPath);
      const thumbInfo = await MediaCommon.getFileInfo(thumbPath);
      results.checks.push({ 
        name: 'verify-video', 
        status: videoInfo.exists ? 'pass' : 'fail', 
        details: videoInfo.exists ? 'Accessible' : 'Not found' 
      });
      results.checks.push({ 
        name: 'verify-thumbnail', 
        status: thumbInfo.exists ? 'pass' : 'fail', 
        details: thumbInfo.exists ? 'Accessible' : 'Not found' 
      });
      
      URL.revokeObjectURL(thumbnail.url);
      
      if (options.cleanup !== false) {
        await MediaCommon.deleteFile(videoPath);
        await MediaCommon.deleteFile(thumbPath);
        results.checks.push({ name: 'cleanup', status: 'pass', details: 'Both files deleted' });
      }
      
      results.status = 'pass';
      results.duration = Date.now() - results.startTime;
      
    } catch (err) {
      results.status = 'fail';
      results.error = err.message;
      results.duration = Date.now() - results.startTime;
      
      if (options.cleanup !== false) {
        if (videoPath) await MediaCommon.deleteFile(videoPath);
        if (thumbPath) await MediaCommon.deleteFile(thumbPath);
      }
    }
    
    return results;
  }
};

export default VideoTools;
