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
}
