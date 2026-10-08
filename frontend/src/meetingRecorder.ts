// Records a seminar call in the host's browser ("⏺ Record" in the call). Chrome
// captures this tab, cropped to the call when it can; the call's sound is mixed
// with the host's microphone, which goes silent while they're muted in the call;
// and the recording is uploaded in 8 MB parts while it runs, so little is left
// to send when it stops. Works in Chrome and Edge on a computer. This file is
// only loaded when a host starts recording.

// R2 needs every part except the last to be the same size
export const PART_SIZE = 8 * 1024 * 1024;

const RECORDING_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

export const canRecordCalls = () =>
  !!navigator.mediaDevices?.getDisplayMedia &&
  typeof MediaRecorder !== 'undefined' &&
  RECORDING_TYPES.some(type => MediaRecorder.isTypeSupported(type));

export interface CallRecording {
  /** Whether the call's sound was shared (otherwise only the microphone is recorded) */
  hasCallSound: boolean;
  setMicMuted(muted: boolean): void;
  /** Stops recording and finishes uploading; resolves with the recording's length */
  stop(): Promise<{ durationSec: number }>;
}

interface RecordingOptions {
  /** The call area; the recording is cropped to it where the browser allows */
  cropTo: Element | null;
  micMuted: boolean;
  /** Called once the host has agreed to share: creates the recording on the server
   *  and returns the function that uploads each part */
  createRecording: (mimeType: string) => Promise<(partNumber: number, part: Blob) => Promise<void>>;
  /** Chrome's own "Stop sharing" was clicked */
  onSharingStopped: () => void;
  /** A part couldn't be uploaded and the recording can't continue */
  onUploadFailed: (error: unknown) => void;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function startCallRecording(options: RecordingOptions): Promise<CallRecording> {
  const mimeType = RECORDING_TYPES.find(type => MediaRecorder.isTypeSupported(type))!;

  // preferCurrentTab makes Chrome offer "this tab" first
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 24, max: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { suppressLocalAudioPlayback: false },
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    systemAudio: 'include'
  } as DisplayMediaStreamOptions);
  const [video] = display.getVideoTracks();
  const callSound = display.getAudioTracks()[0];
  const tracks: MediaStreamTrack[] = [...display.getTracks()];
  let audioContext: AudioContext | null = null;
  const cleanUp = () => {
    tracks.forEach(track => track.stop());
    audioContext?.close().catch(() => {});
  };

  try {
    // Keep only the call area (Chrome's Region Capture); this only works when
    // this tab is the one being shared, otherwise the whole share is recorded
    const CropTarget = (window as any).CropTarget;
    if (options.cropTo && CropTarget && typeof (video as any).cropTo === 'function') {
      try {
        await (video as any).cropTo(await CropTarget.fromElement(options.cropTo));
      } catch { /* record uncropped */ }
    }

    // The host's own voice isn't part of the tab's sound, so it's added from the microphone
    let mic: MediaStream | null = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      tracks.push(...mic.getTracks());
    } catch { /* no microphone: record the call's sound only */ }

    audioContext = new AudioContext();
    await audioContext.resume().catch(() => {});
    const mixed = audioContext.createMediaStreamDestination();
    if (callSound) audioContext.createMediaStreamSource(new MediaStream([callSound])).connect(mixed);
    let micGain: GainNode | null = null;
    if (mic) {
      micGain = audioContext.createGain();
      micGain.gain.value = options.micMuted ? 0 : 1;
      audioContext.createMediaStreamSource(mic).connect(micGain).connect(mixed);
    }
    const stream = new MediaStream([video, ...(callSound || mic ? mixed.stream.getAudioTracks() : [])]);

    const uploadPart = await options.createRecording(mimeType);

    // Recorded data collects here and is cut into PART_SIZE parts, uploaded one
    // at a time and in order. A failed part is retried until it goes through;
    // once stopping, it gives up after a few tries (the server keeps the parts
    // that did arrive).
    let pending: Blob[] = [];
    const queue: Blob[] = [];
    let nextPartNumber = 1;
    let stopping = false;
    let uploadError: unknown = null;
    let uploading: Promise<void> = Promise.resolve();
    let pumping = false;

    const sendWithRetry = async (partNumber: number, part: Blob) => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await uploadPart(partNumber, part);
        } catch (error: any) {
          const status = error?.response?.status;
          // The server no longer takes parts for this recording
          if (status === 404 || status === 409 || (stopping && attempt >= 5)) throw error;
          await wait(Math.min(30000, 2000 * 2 ** Math.min(attempt - 1, 4)));
        }
      }
    };
    const pump = () => {
      if (pumping || uploadError) return;
      pumping = true;
      uploading = (async () => {
        try {
          while (queue.length) {
            await sendWithRetry(nextPartNumber, queue[0]);
            queue.shift();
            nextPartNumber++;
          }
        } catch (error) {
          uploadError = error;
          options.onUploadFailed(error);
        } finally {
          pumping = false;
        }
      })();
    };
    const cutParts = (final: boolean) => {
      let rest = new Blob(pending, { type: mimeType });
      while (rest.size >= PART_SIZE) {
        queue.push(rest.slice(0, PART_SIZE, mimeType));
        rest = rest.slice(PART_SIZE, rest.size, mimeType);
      }
      if (final && rest.size > 0) {
        queue.push(rest);
        rest = new Blob([], { type: mimeType });
      }
      pending = rest.size ? [rest] : [];
      pump();
    };

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 96_000 });
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        pending.push(event.data);
        cutParts(false);
      }
    };
    video.addEventListener('ended', () => options.onSharingStopped());
    recorder.start(4000);
    const startedAt = Date.now();

    let stopped: Promise<{ durationSec: number }> | null = null;
    return {
      hasCallSound: !!callSound,
      setMicMuted: muted => { if (micGain) micGain.gain.value = muted ? 0 : 1; },
      stop: () => stopped ??= new Promise((resolve, reject) => {
        stopping = true;
        const durationSec = Math.round((Date.now() - startedAt) / 1000);
        const finish = async () => {
          try {
            cutParts(true);
            // Wait until every part is uploaded (pump runs again if parts arrived while it was idle)
            while (queue.length && !uploadError) {
              await uploading;
              if (queue.length && !uploadError) pump();
            }
            cleanUp();
            if (uploadError) reject(uploadError);
            else resolve({ durationSec });
          } catch (error) {
            cleanUp();
            reject(error);
          }
        };
        if (recorder.state === 'inactive') finish();
        else {
          recorder.onstop = () => { finish(); };
          recorder.stop();
        }
      })
    };
  } catch (error) {
    cleanUp();
    throw error;
  }
}
