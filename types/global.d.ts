export {};

declare global {
  interface Window {
    ENV: {
      API_BASE_URL: string;
    };
  }
}
