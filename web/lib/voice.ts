export interface SpeechRecognizerControl {
  start: () => void;
  stop: () => void;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

/** Single-flight guard so recognition.start() is never double-invoked (avoids InvalidStateError). */
let isSpeechRecognizerActive = false;

export function createSpeechRecognizer(
  onResult: (text: string) => void,
  onListeningChange: (listening: boolean) => void
): SpeechRecognizerControl | null {
  if (typeof window === "undefined") return null;
  const SpeechRecognitionClass =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionClass) return null;

  const recognition = new SpeechRecognitionClass();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  /** Tracks whether recognition is active; synced with onstart/onend/onerror */
  let isRecognizerListening = false;

  recognition.onstart = () => {
    isRecognizerListening = true;
    onListeningChange(true);
  };
  recognition.onend = () => {
    isRecognizerListening = false;
    onListeningChange(false);
  };
  recognition.onerror = () => {
    isRecognizerListening = false;
    onListeningChange(false);
  };
  recognition.onresult = (event: Event) => {
    const speechEvent = event as SpeechRecognitionEventLike;
    const transcript = speechEvent.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) onResult(transcript);
  };

  return {
    start: () => {
      if (isSpeechRecognizerActive) return;
      try {
        recognition.start();
        isSpeechRecognizerActive = true;
      } catch {
        isSpeechRecognizerActive = false;
      }
    },
    stop: () => {
      if (!isSpeechRecognizerActive) return;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      isSpeechRecognizerActive = false;
    },
  };
}

export function cancelSpeech(): void {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
}

export function speakText(text: string, onEnd?: () => void): void {
  if (typeof window === "undefined" || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onend = () => {
    onEnd?.();
  };
  window.speechSynthesis.speak(utterance);
}
