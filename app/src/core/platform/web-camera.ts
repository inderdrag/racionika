// Development preview only. Android uses CameraSource.Camera, never a file/gallery prompt.
export async function captureWebPhoto(signal?: AbortSignal): Promise<string | undefined> {
  signal?.throwIfAborted();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера недоступна в этом браузере.');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  const stop = () => stream.getTracks().forEach((track) => track.stop());
  if (signal?.aborted) {
    stop();
    signal.throwIfAborted();
  }
  return new Promise((resolve, reject) => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'camera-preview';
    dialog.setAttribute('aria-label', 'Камера');
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    const take = document.createElement('button');
    take.type = 'button';
    take.className = 'primary';
    take.textContent = 'Сфотографировать';
    take.disabled = true;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'text-button';
    cancel.textContent = 'Отмена';
    let finished = false;
    function finish(value?: string, error?: unknown) {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', aborted);
      stop();
      video.srcObject = null;
      dialog.close();
      dialog.remove();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      if (error) reject(error);
      else resolve(value);
    }
    function aborted() {
      finish(undefined, signal?.reason ?? new DOMException('Отменено', 'AbortError'));
    }
    cancel.onclick = () => finish();
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish();
    };
    video.onloadeddata = () => {
      take.disabled = false;
    };
    video.onerror = () => finish(undefined, new Error('Не удалось открыть камеру.'));
    take.onclick = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Не удалось сделать фото.');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.85));
      } catch (error) {
        finish(undefined, error);
      }
    };
    signal?.addEventListener('abort', aborted, { once: true });
    dialog.append(video, take, cancel);
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (error) {
      finish(undefined, error);
    }
  });
}
