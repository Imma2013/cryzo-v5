interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  webkitSpeechRecognition: typeof SpeechRecognition;
  SpeechRecognition: typeof SpeechRecognition;
}

interface Performance {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}

declare module 'react-dom/server.browser' {
  export * from 'react-dom/server';
}
