// Shared project data. Each project lives in data/projects/{id}/ and
// project.json is the single source of truth for everything the editor shows.
// Later steps add more files next to it (transcript, script, voice clips...).

export type ProjectStatus =
  | "uploaded"
  | "transcribing"
  | "writing"
  | "voicing"
  | "ready"
  | "error";

export interface VideoInfo {
  file: string; // file name inside the project folder, never modified
  mimeType: string;
  duration: number; // seconds
  width: number;
  height: number;
  size: number; // bytes
}

export interface Project {
  id: string;
  title: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  status: ProjectStatus;
  video: VideoInfo;
  thumbnail: string | null; // file name inside the project folder
  keyterms?: string[]; // product names / technical words to help transcription
  statusDetail?: string; // live message for the current processing step
  stepStartedAt?: string; // ISO, when the current status began
  error?: { step: ProjectStatus; message: string } | null;
  segments?: Segment[]; // built from the transcript (Step 3); the script is edited here
  rewrite?: { model: string; at: string; missing: number } | null; // last AI rewrite (Step 4)
  voice?: VoiceSettings; // Step 5; DEFAULT_VOICE when missing
}

export interface VoiceSettings {
  mode: "ai" | "original"; // "original" keeps the recorded narration and ignores AI clips
  voiceId: string; // ElevenLabs voice
  voiceName: string;
  model: string; // ElevenLabs model id
}

// A generated ElevenLabs clip. Character timestamps live in voice-{hash}.json.
export interface VoiceClip {
  file: string; // voice-{hash}.mp3 in the project folder
  text: string; // the exact text it was generated from
  voiceId: string;
  model: string;
  duration: number; // seconds
}

// A paragraph of the script. Segments tile the whole video in source time:
// segment[i].end === segment[i + 1].start, first starts at 0, last ends at the video's end.
export interface Segment {
  id: string;
  start: number; // video range this paragraph owns (seconds, source time)
  end: number;
  speechStart: number; // first/last spoken word inside that range
  speechEnd: number;
  wordStart: number; // transcript.words indices [wordStart, wordEnd)
  wordEnd: number;
  originalText: string; // what was actually said
  text: string; // the script text that gets narrated ("" = no narration)
  aiText?: string; // the AI-polished version (Step 4), kept for "revert to AI version"
  isRetake?: boolean; // AI flagged this paragraph as a mistake/retake; Step 6 cuts or speeds it
  deleted?: boolean; // removed from the script (restorable); Step 9 turns this into a cut
  voice?: VoiceClip; // last generated AI voice clip (Step 5)
  breakReason: "pause" | "length" | "end" | "split"; // why the paragraph ended (debug); "split" = added by hand
  pauseAfter: number; // silence before the next paragraph's first word
}

// transcript.json: words in seconds (AssemblyAI returns milliseconds).
export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface Transcript {
  assemblyId: string;
  createdAt: string;
  text: string;
  words: TranscriptWord[];
}
