import type {
  AuthStatus,
  NoteDetail,
  NoteId,
  NotesApiErrorPayload,
  NotesPage,
  NoteSummary
} from "../types";

type JsonMethod = "GET" | "POST";

type ApiErrorResponse = {
  ok: false;
  error?: NotesApiErrorPayload;
};

type ListQuery = {
  searchString?: string;
  page?: number;
  pageSize?: number;
};

type RequestOptions = {
  method?: JsonMethod;
  body?: unknown;
};

function buildQueryString(query: Record<string, unknown>) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function normalizeTags(input: unknown): string[] {
  const values = Array.isArray(input) ? input : input != null ? [input] : [];

  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

export class NotesApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  retryable: boolean;
  requestId?: string;

  constructor(status: number, payload: NotesApiErrorPayload) {
    super(payload.message || payload.code || "Unknown API error");
    this.name = "NotesApiError";
    this.status = status;
    this.code = payload.code || "INTERNAL_ERROR";
    this.details = payload.details;
    this.retryable = Boolean(payload.retryable);
    this.requestId = payload.requestId;
  }
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const errorResponse = body as ApiErrorResponse;
    throw new NotesApiError(response.status, {
      code: errorResponse?.error?.code ?? "INTERNAL_ERROR",
      message: errorResponse?.error?.message ?? response.statusText,
      details: errorResponse?.error?.details,
      retryable: errorResponse?.error?.retryable,
      requestId: errorResponse?.error?.requestId
    });
  }

  return body as T;
}

function normalizeSummary(note: NoteSummary): NoteSummary {
  return {
    ...note,
    _id: String(note._id),
    category: normalizeTags(note.category)
  };
}

function normalizeDetail(note: NoteDetail): NoteDetail {
  return {
    ...note,
    _id: String(note._id),
    note: String(note.note ?? ""),
    category: normalizeTags(note.category)
  };
}

export type NotesApi = {
  getAuthStatus(): Promise<AuthStatus>;
  login(password: string): Promise<AuthStatus>;
  logout(): Promise<AuthStatus>;
  listNotes(query?: ListQuery): Promise<NoteSummary[]>;
  listNotesPaged(query?: ListQuery): Promise<NotesPage>;
  getNote(id: NoteId): Promise<NoteDetail>;
  createNote(payload: { title: string; note: string; category: string[] }): Promise<NoteSummary>;
  updateNote(payload: {
    id: NoteId;
    title?: string;
    note?: string;
    category?: string[];
    favorite?: boolean;
  }): Promise<NoteSummary>;
  deleteNote(id: NoteId): Promise<{ result: boolean }>;
  uploadImage(file: File): Promise<{ filepath: string }>;
};

export const notesApi: NotesApi = {
  async getAuthStatus() {
    return requestJson<AuthStatus>("/auth/me");
  },

  async login(password) {
    return requestJson<AuthStatus>("/auth/login", {
      method: "POST",
      body: { password }
    });
  },

  async logout() {
    return requestJson<AuthStatus>("/auth/logout", {
      method: "POST",
      body: {}
    });
  },

  async listNotes(query = {}) {
    const path = `/jnote/read${buildQueryString({
      searchString: query.searchString
    })}`;
    const result = await requestJson<NoteSummary[] | NotesPage>(path);

    if (Array.isArray(result)) {
      return result.map(normalizeSummary);
    }

    return result.items.map(normalizeSummary);
  },

  async listNotesPaged(query = {}) {
    const path = `/jnote/read${buildQueryString({
      searchString: query.searchString,
      page: query.page,
      pageSize: query.pageSize
    })}`;
    const result = await requestJson<NoteSummary[] | NotesPage>(path);

    if (Array.isArray(result)) {
      const items = result.map(normalizeSummary);
      return {
        items,
        page: 1,
        pageSize: items.length,
        total: items.length,
        hasNext: false
      };
    }

    return {
      ...result,
      items: result.items.map(normalizeSummary)
    };
  },

  async getNote(id) {
    const note = await requestJson<NoteDetail>(`/jnote/read/${id}`);
    return normalizeDetail(note);
  },

  async createNote(payload) {
    const note = await requestJson<NoteSummary>("/jnote/create", {
      method: "POST",
      body: {
        title: payload.title,
        note: payload.note,
        category: normalizeTags(payload.category)
      }
    });
    return normalizeSummary(note);
  },

  async updateNote(payload) {
    const note = await requestJson<NoteSummary>("/jnote/update", {
      method: "POST",
      body: {
        id: payload.id,
        title: payload.title,
        note: payload.note,
        category: payload.category ? normalizeTags(payload.category) : undefined,
        favorite: payload.favorite
      }
    });
    return normalizeSummary(note);
  },

  async deleteNote(id) {
    return requestJson<{ result: boolean }>("/jnote/delete", {
      method: "POST",
      body: { id }
    });
  },

  async uploadImage(file) {
    const form = new FormData();
    form.append("pict", file);

    const response = await fetch("/jnote/upload", {
      method: "POST",
      credentials: "include",
      body: form
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new NotesApiError(response.status, {
        code: payload?.error?.code ?? "FILE_SAVE_FAILED",
        message: payload?.error?.message ?? "Image upload failed",
        details: payload?.error?.details,
        retryable: payload?.error?.retryable,
        requestId: payload?.error?.requestId
      });
    }

    return {
      filepath: String(payload.filepath)
    };
  }
};
