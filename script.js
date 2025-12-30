const video = document.getElementById("video");
const stripPreview = document.getElementById("stripPreview");
const countdownEl = document.getElementById("countdown");
const startBtn = document.getElementById("startBtn");
const delaySelect = document.getElementById("delaySelect");
const mirrorCheck = document.getElementById("mirrorCheck");

const frameCoords = [
  { x: 167, y: 215, w: 1876, h: 1098 },
  { x: 167, y: 1417, w: 1876, h: 1098 },
  { x: 167, y: 2608, w: 1876, h: 1098 },
  { x: 167, y: 3796, w: 1876, h: 1100 }
];

let naturalWBig, naturalHBig;
let capturedImages = [];
let isCapturing = false;
let recordedChunks = [];
let mediaRecorder = null;
let chosenMime = '';
let fileExt = 'webm';

(async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() =>
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    );
    video.srcObject = stream;

    if ('MediaRecorder' in window) {
      const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          chosenMime = type;
          fileExt = type.includes('mp4') ? 'mp4' : 'webm';
          break;
        }
      }

      mediaRecorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);
      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size) recordedChunks.push(e.data);
      };
    }
  } catch (err) {
    alert('Camera access denied: ' + err.message);
  }
})();

function setupOverlays(container, imgElement, baseW) {
  const scale = imgElement.clientWidth / baseW;
  frameCoords.forEach((f, i) => {
    let frameImg = container.querySelector(`.frame-img[data-index="${i}"]`);
    if (!frameImg) {
      frameImg = document.createElement('img');
      frameImg.className = 'frame-img';
      frameImg.dataset.index = i;
      container.insertBefore(frameImg, imgElement);
    }
    Object.assign(frameImg.style, {
      left: `${f.x * scale}px`,
      top: `${f.y * scale}px`,
      width: `${f.w * scale}px`,
      height: `${f.h * scale}px`
    });
  });
}

stripPreview.onload = () => {
  naturalWBig = stripPreview.naturalWidth;
  naturalHBig = stripPreview.naturalHeight;
  setupOverlays(document.querySelector('.big-strip-container'), stripPreview, naturalWBig);
};

mirrorCheck.addEventListener('change', () => {
  video.style.transform = mirrorCheck.checked ? 'scaleX(-1)' : 'scaleX(1)';
});

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function ensureVideoReady() {
  if (video.videoWidth && video.videoHeight) return;
  await new Promise(res => video.addEventListener('loadedmetadata', res, { once: true }));
}

async function runCountdown(seconds) {
  countdownEl.textContent = seconds;
  for (let i = seconds - 1; i >= 0; i--) {
    await sleep(1000);
    countdownEl.textContent = i > 0 ? i : '';
  }
}

async function captureFrameAt(index) {
  const coord = frameCoords[index];
  const canvas = document.createElement('canvas');
  canvas.width = coord.w;
  canvas.height = coord.h;
  const ctx = canvas.getContext('2d');

  if (mirrorCheck.checked) {
    ctx.translate(coord.w, 0);
    ctx.scale(-1, 1);
  }

  const scale = Math.max(coord.w / video.videoWidth, coord.h / video.videoHeight);
  const drawW = video.videoWidth * scale;
  const drawH = video.videoHeight * scale;
  const offsetX = (coord.w - drawW) / 2;
  const offsetY = (coord.h - drawH) / 2;

  ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
  const dataURL = canvas.toDataURL('image/png');
  capturedImages[index] = dataURL;

  document.querySelectorAll(`.frame-img[data-index="${index}"]`).forEach(slot => {
    slot.src = dataURL;
  });
}

startBtn.addEventListener('click', async () => {
  if (isCapturing) return;
  isCapturing = true;
  startBtn.disabled = true;
  recordedChunks = [];
  capturedImages = [];

  await ensureVideoReady();

  try {
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
      mediaRecorder.start();
    }
  } catch (e) {
    console.warn('Recorder start failed:', e);
  }

  const delay = parseInt(delaySelect.value, 10) || 3;

  try {
    for (let i = 0; i < frameCoords.length; i++) {
      await runCountdown(delay);
      await captureFrameAt(i);
      await sleep(400);
    }
  } finally {
    try {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        await new Promise(res => {
          mediaRecorder.onstop = res;
          mediaRecorder.stop();
        });
      }
    } catch (e) {
      console.warn('Recorder stop failed:', e);
    }
    countdownEl.textContent = '';
    isCapturing = false;
    startBtn.disabled = false;
  }
});

document.getElementById('downloadStrip').addEventListener('click', () => {
  if (!naturalWBig || !naturalHBig) return alert('Strip not ready yet.');
  if (!capturedImages.length) return alert('No photos captured yet.');

  const canvas = document.createElement('canvas');
  canvas.width = naturalWBig;
  canvas.height = naturalHBig;
  const ctx = canvas.getContext('2d');

  let loadedCount = 0;
  capturedImages.forEach((src, i) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, frameCoords[i].x, frameCoords[i].y, frameCoords[i].w, frameCoords[i].h);
      loadedCount++;
      if (loadedCount === capturedImages.length) {
        const frameImg = new Image();
        frameImg.onload = () => {
          ctx.drawImage(frameImg, 0, 0, naturalWBig, naturalHBig);
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = 'photobooth.png';
          document.body.appendChild(link);
          link.click();
          link.remove();
        };
        frameImg.src = stripPreview.src;
      }
    };
    img.src = src;
  });
});

document.getElementById('downloadVideo').addEventListener('click', () => {
  if (!recordedChunks.length) return alert('No recorded video yet. Press START to record a session.');
  const blob = new Blob(recordedChunks, { type: chosenMime || 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `photobooth_session.${fileExt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// ✅ Swap clicked preview with main strip
document.querySelectorAll('.small-preview').forEach(preview => {
  preview.addEventListener('click', () => {
    const mainSrc = stripPreview.src;
    const newSrc = preview.getAttribute('data-strip');

    // Swap images
    stripPreview.src = newSrc;
    preview.src = mainSrc;

    // Swap data-strip attributes
    preview.setAttribute('data-strip', mainSrc);

    // Re-trigger overlay setup
    stripPreview.onload();
  });
});
