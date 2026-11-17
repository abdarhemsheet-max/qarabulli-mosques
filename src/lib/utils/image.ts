const MAX_WIDTH_PX = 1000;
const INITIAL_QUALITY = 0.7;
const MAX_SINGLE_PHOTO_CHARS = 280000; // Ensures 3 photos + fields stay < 900KB

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذّر قراءة ملف الصورة المختار.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Compress an image file in the browser to max width 1000px, JPEG quality 0.7,
 * returning a base64 data URL guaranteed to stay within Firestore document budget.
 */
export async function compressImageToBase64(file: File): Promise<string> {
  const img = await loadImageFromFile(file);

  const scale = img.width > MAX_WIDTH_PX ? MAX_WIDTH_PX / img.width : 1;
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذّر معالجة الصورة في المتصفح.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  let quality = INITIAL_QUALITY;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  while (dataUrl.length > MAX_SINGLE_PHOTO_CHARS && quality > 0.35) {
    quality = Number((quality - 0.1).toFixed(2));
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  if (dataUrl.length > 340000) {
    throw new Error('حجم الصورة بعد الضغط كبير جداً، يرجى اختيار صورة أخرى.');
  }

  return dataUrl;
}
