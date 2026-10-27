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
  text: string; // the script text (rewrites and edits land here in later steps)
  breakReason: "pause" | "length" | "end"; // why the paragraph ended (debug)
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
