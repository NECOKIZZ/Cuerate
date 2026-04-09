export function detectImageFileDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      reject(new Error('Could not read the uploaded image metadata.'));
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  });
}

export function detectVideoFileDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(objectUrl);
    };
    video.onerror = () => {
      reject(new Error('Could not read the uploaded video metadata.'));
      URL.revokeObjectURL(objectUrl);
    };
    video.src = objectUrl;
  });
}

export function createVideoThumbnailFile(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadedmetadata = () => {
      const safeSeekTime = Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(0.25, video.duration / 2)
        : 0;
      video.currentTime = safeSeekTime;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');

      if (!context) {
        cleanup();
        reject(new Error('Could not create canvas context for video thumbnail.'));
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (!blob) {
            reject(new Error('Could not generate thumbnail from uploaded video.'));
            return;
          }

          const thumbnailFile = new File(
            [blob],
            `${file.name.replace(/\.[^/.]+$/, '')}-thumbnail.jpg`,
            { type: 'image/jpeg' },
          );
          resolve(thumbnailFile);
        },
        'image/jpeg',
        0.85,
      );
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Could not read video data to generate thumbnail.'));
    };

    video.src = objectUrl;
  });
}
