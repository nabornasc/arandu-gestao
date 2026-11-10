import { useEffect, useRef, useState } from 'react';

// Ditado pela voz com o reconhecimento do próprio navegador (Web Speech API): sem custo e sem servidor
// do sistema. Chrome, Edge e Safari têm; no Firefox o botão não aparece. No Chrome, o áudio é
// processado pelo serviço de voz do Google.
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionConstructor = new () => Recognition;

const Recognition: RecognitionConstructor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, RecognitionConstructor | undefined>).SpeechRecognition ??
      (window as unknown as Record<string, RecognitionConstructor | undefined>).webkitSpeechRecognition);

const ERRORS: Record<string, string> = {
  'not-allowed': 'O navegador bloqueou o microfone. Libere o acesso nas configurações do site.',
  'no-speech': 'Não ouvi nada. Tente de novo, falando perto do microfone.',
  network: 'O reconhecimento de voz precisa de internet.',
};

// onText recebe o texto ditado (o parcial vai sendo atualizado enquanto a pessoa fala).
export function useSpeech(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(onText);
  latest.current = onText;

  useEffect(() => () => recognition.current?.stop(), []);

  function start() {
    if (!Recognition || listening) return;
    const instance = new Recognition();
    instance.lang = 'pt-BR';
    instance.interimResults = true;
    instance.continuous = false;
    instance.onresult = (event) => {
      let text = '';
      for (let index = 0; index < event.results.length; index++)
        text += event.results[index]?.[0].transcript ?? '';
      latest.current(text.trim());
    };
    instance.onerror = (event) => {
      if (event.error !== 'aborted') setError(ERRORS[event.error] ?? 'Não foi possível usar o microfone.');
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    setError(null);
    setListening(true);
    instance.start();
  }

  const stop = () => recognition.current?.stop();

  return { supported: Boolean(Recognition), listening, error, start, stop };
}
