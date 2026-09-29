export interface CallInput {
  system: string;
  prompt: string;
}

export interface CallHandlers {
  /** Called with the full text generated so far. */
  onText: (snapshot: string) => void;
}
