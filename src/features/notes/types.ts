export type NoteId = string;

export type NoteSummary = {
  _id: NoteId;
  title: string;
  note?: string;
  category: string[];
  favorite: boolean;
  regdate?: string;
  moddate?: string;
};

export type NoteDetail = {
  _id: NoteId;
  title: string;
  note: string;
  category: string[];
};

export type NotesPage = {
  items: NoteSummary[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
};

export type NotesApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  requestId?: string;
};

export type AuthStatus = {
  ok: true;
  enabled: boolean;
  authenticated: boolean;
};
