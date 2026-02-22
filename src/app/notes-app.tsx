import { mount, mountCallback, ref } from "lithent";
import { state } from "lithent/helper";
import { NotesApiError, notesApi, type NotesApi } from "../features/notes/api/notes-api";
import type { NoteDetail, NoteSummary } from "../features/notes/types";
import { MonacoVimEditor } from "../features/editor/monaco-vim-editor";
import { resolveExCommand } from "../features/editor/ex-command-dispatcher";
import { buildPreviewBlocks, findPreviewBlock } from "../features/preview/line-map";
import { renderMarkdownToHtml } from "../features/preview/markdown-render";

type ViewMode = "list" | "view" | "write";

function toTagString(tags: string[]) {
  return tags.join(", ");
}

function parseTagString(input: string) {
  return [...new Set(input.split(/[\s,;:]+/).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function toDisplayError(error: unknown) {
  if (error instanceof NotesApiError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isTextInputTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") {
    return true;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest(".monaco-editor"));
}

export const NotesApp = mount<{ api?: NotesApi }>((renew, props) => {
  const api = props.api ?? notesApi;

  const mode = state<ViewMode>("list", renew);
  const listLoading = state(false, renew);
  const detailLoading = state(false, renew);
  const saving = state(false, renew);
  const deleting = state(false, renew);
  const errorMessage = state("", renew);
  const statusMessage = state("", renew);
  const searchText = state("", renew);
  const authLoading = state(true, renew);
  const authEnabled = state(true, renew);
  const authenticated = state(false, renew);
  const authExpired = state(false, renew);
  const authPassword = state("", renew);

  const notes = state<NoteSummary[]>([], renew);
  const selected = state<NoteDetail | null>(null, renew);
  const editingId = state<string | null>(null, renew);

  const formTitle = state("", renew);
  const formTags = state("", renew);
  const formNote = state("", renew);
  const dirty = state(false, renew);
  const editorCursorLine = state(1, renew);
  const editorFocusSignal = state(0, renew);

  const previewContainerRef = ref<HTMLElement | null>(null);
  const commandInputRef = ref<HTMLInputElement | null>(null);
  const previewCooldownUntil = state(0, renew);
  const previewFollowBottom = state(false, renew);
  const commandInput = state("", renew);
  const commandFeedback = state("Ready.", renew);
  const commandFeedbackError = state(false, renew);

  let lastSyncedLine = 0;
  let lastSyncedBlockStart = -1;
  let syncFrameId = 0;
  let programmaticScrollLock = false;
  const PREVIEW_BOTTOM_THRESHOLD = 3;

  const clearStatus = () => {
    errorMessage.v = "";
    statusMessage.v = "";
    authExpired.v = false;
  };

  const setFailure = (error: unknown) => {
    errorMessage.v = toDisplayError(error);
  };

  const setAuthExpired = (message = "Session expired. Please login again.") => {
    authenticated.v = false;
    authExpired.v = true;
    errorMessage.v = message;
    statusMessage.v = "";
  };

  const handleApiFailure = (
    error: unknown,
    options: { authMessage?: string; commandMessage?: string } = {}
  ) => {
    if (error instanceof NotesApiError && error.status === 401) {
      setAuthExpired(options.authMessage);
      if (options.commandMessage) {
        setCommandStatus(options.commandMessage, true);
      }
      return;
    }

    setFailure(error);
  };

  const setCommandStatus = (message: string, isError = false) => {
    commandFeedback.v = message;
    commandFeedbackError.v = isError;
  };

  const canWrite = () => !authEnabled.v || authenticated.v;

  const requireWriteAccess = (message = "Login is required for write operations.") => {
    if (canWrite()) {
      return true;
    }

    errorMessage.v = message;
    setCommandStatus(message, true);
    return false;
  };

  const focusCommandInput = (prefill = "") => {
    commandInput.v = prefill;
    requestAnimationFrame(() => {
      const input = commandInputRef.value;
      if (!input) {
        return;
      }

      input.focus();
      const cursor = input.value.length;
      input.setSelectionRange(cursor, cursor);
    });
  };

  const focusEditorElement = () => {
    if (typeof document === "undefined") {
      return false;
    }

    const monacoInput =
      (document.querySelector(".monaco-editor textarea.inputarea") as HTMLTextAreaElement | null) ??
      (document.querySelector(".monaco-editor textarea") as HTMLTextAreaElement | null);
    if (monacoInput) {
      monacoInput.focus();
      return true;
    }

    const fallbackInput = document.querySelector(".note-input:not(.hidden)") as HTMLTextAreaElement | null;
    if (fallbackInput) {
      fallbackInput.focus();
      return true;
    }

    return false;
  };

  const focusEditorWithRetry = (attempts = 6) => {
    if (focusEditorElement() || attempts <= 0) {
      return;
    }

    requestAnimationFrame(() => {
      focusEditorWithRetry(attempts - 1);
    });
  };

  const requestEditorFocus = () => {
    editorFocusSignal.v += 1;
    focusEditorWithRetry();
  };

  const markDirty = () => {
    if (!dirty.v) {
      dirty.v = true;
    }
  };

  const pauseAutoSyncTemporarily = (milliseconds = 300) => {
    previewCooldownUntil.v = Date.now() + milliseconds;
  };

  const handlePreviewUserScroll = () => {
    if (programmaticScrollLock) {
      return;
    }
    previewFollowBottom.v = false;
    pauseAutoSyncTemporarily();
  };

  const schedulePreviewSync = (runner: () => void) => {
    if (syncFrameId) {
      cancelAnimationFrame(syncFrameId);
    }

    syncFrameId = requestAnimationFrame(() => {
      runner();
      syncFrameId = 0;
    });
  };

  const syncPreviewToBottom = () => {
    const container = previewContainerRef.value;
    if (!container) {
      return;
    }

    const blockNodes = [...container.querySelectorAll<HTMLElement>("[data-line-start]")];
    const lastNode = blockNodes[blockNodes.length - 1] ?? null;
    if (!lastNode) {
      return;
    }

    programmaticScrollLock = true;
    lastSyncedBlockStart = Number(lastNode.dataset.lineStart ?? "-1");
    lastNode.scrollIntoView({
      block: "end",
      behavior: "auto"
    });

    window.setTimeout(() => {
      programmaticScrollLock = false;
    }, 80);
  };

  const syncPreviewToLine = (lineNumber: number) => {
    const container = previewContainerRef.value;
    if (!container) {
      return;
    }

    const blockNodes = [...container.querySelectorAll<HTMLElement>("[data-line-start]")];
    if (blockNodes.length === 0) {
      return;
    }

    const blockMeta = blockNodes.map((node) => ({
      node,
      start: Number(node.dataset.lineStart ?? "0"),
      end: Number(node.dataset.lineEnd ?? "0"),
      text: ""
    }));
    const targetBlock = findPreviewBlock(blockMeta, lineNumber);
    const finalTarget =
      blockMeta.find((item) => item.start === targetBlock?.start && item.end === targetBlock?.end)?.node ??
      blockNodes[0] ??
      null;

    if (!finalTarget) {
      return;
    }

    const finalTargetStart = Number(finalTarget.dataset.lineStart ?? "-1");
    if (finalTargetStart === lastSyncedBlockStart) {
      return;
    }

    lastSyncedBlockStart = finalTargetStart;
    programmaticScrollLock = true;
    finalTarget.scrollIntoView({
      block: "center",
      behavior: "auto"
    });

    window.setTimeout(() => {
      programmaticScrollLock = false;
    }, 80);
  };

  const handleEditorCursorLineChange = (lineNumber: number) => {
    editorCursorLine.v = lineNumber;

    const totalLines = Math.max(1, String(formNote.v ?? "").split("\n").length);
    const nearBottom = totalLines - lineNumber <= PREVIEW_BOTTOM_THRESHOLD;
    const cooldownActive = Date.now() < previewCooldownUntil.v;

    if (!cooldownActive && nearBottom) {
      previewFollowBottom.v = true;
    }

    if (!nearBottom) {
      previewFollowBottom.v = false;
    }

    if (previewFollowBottom.v && !cooldownActive) {
      lastSyncedLine = lineNumber;
      schedulePreviewSync(syncPreviewToBottom);
      return;
    }

    if (lineNumber === lastSyncedLine || cooldownActive) {
      return;
    }

    lastSyncedLine = lineNumber;
    schedulePreviewSync(() => {
      syncPreviewToLine(lineNumber);
    });
  };

  const setFormFromDetail = (detail: NoteDetail | null) => {
    if (!detail) {
      formTitle.v = "";
      formTags.v = "";
      formNote.v = "";
      return;
    }

    formTitle.v = detail.title;
    formTags.v = toTagString(detail.category);
    formNote.v = detail.note;
  };

  const loadList = async () => {
    listLoading.v = true;
    clearStatus();

    try {
      const items = await api.listNotes({
        searchString: searchText.v
      });
      notes.v = items;
    } catch (error) {
      setFailure(error);
    } finally {
      listLoading.v = false;
    }
  };

  const loadAuthStatus = async () => {
    authLoading.v = true;

    try {
      const status = await api.getAuthStatus();
      authEnabled.v = Boolean(status.enabled);
      authenticated.v = Boolean(status.authenticated);
      if (authenticated.v) {
        authExpired.v = false;
      }
    } catch (error) {
      authEnabled.v = false;
      authenticated.v = true;
      setFailure(error);
    } finally {
      authLoading.v = false;
    }
  };

  const login = async () => {
    const password = authPassword.v.trim();
    if (!password) {
      errorMessage.v = "password is required";
      return;
    }

    clearStatus();
    authLoading.v = true;

    try {
      const status = await api.login(password);
      authEnabled.v = Boolean(status.enabled);
      authenticated.v = Boolean(status.authenticated);
      authExpired.v = false;
      authPassword.v = "";
      statusMessage.v = "Authenticated.";
      setCommandStatus("Authentication complete.");
    } catch (error) {
      setFailure(error);
    } finally {
      authLoading.v = false;
    }
  };

  const logout = async () => {
    clearStatus();
    authLoading.v = true;

    try {
      const status = await api.logout();
      authEnabled.v = Boolean(status.enabled);
      authenticated.v = Boolean(status.authenticated);
      authExpired.v = false;
      statusMessage.v = "Signed out.";
      setCommandStatus("Signed out.");
    } catch (error) {
      setFailure(error);
    } finally {
      authLoading.v = false;
    }
  };

  const openNote = async (id: string) => {
    mode.v = "view";
    previewFollowBottom.v = false;
    detailLoading.v = true;
    clearStatus();

    try {
      selected.v = await api.getNote(id);
    } catch (error) {
      setFailure(error);
    } finally {
      detailLoading.v = false;
    }
  };

  const startCreate = ({ focusEditor = true }: { focusEditor?: boolean } = {}) => {
    if (!requireWriteAccess()) {
      return;
    }

    mode.v = "write";
    previewFollowBottom.v = false;
    editingId.v = null;
    selected.v = null;
    setFormFromDetail(null);
    dirty.v = false;
    clearStatus();

    if (focusEditor) {
      requestEditorFocus();
    }
  };

  const startEdit = ({ focusEditor = true }: { focusEditor?: boolean } = {}) => {
    if (!selected.v) {
      return;
    }

    if (!requireWriteAccess()) {
      return;
    }

    mode.v = "write";
    previewFollowBottom.v = false;
    editingId.v = selected.v._id;
    setFormFromDetail(selected.v);
    dirty.v = false;
    clearStatus();

    if (focusEditor) {
      requestEditorFocus();
    }
  };

  const cancelEdit = () => {
    if (dirty.v && !window.confirm("Unsaved changes will be lost. Continue?")) {
      return;
    }

    dirty.v = false;
    previewFollowBottom.v = false;
    clearStatus();

    if (selected.v) {
      mode.v = "view";
      setFormFromDetail(selected.v);
      return;
    }

    mode.v = "list";
    setFormFromDetail(null);
  };

  const saveNote = async ({ closeAfterSave = false }: { closeAfterSave?: boolean } = {}): Promise<boolean> => {
    if (!requireWriteAccess()) {
      return false;
    }

    const title = formTitle.v.trim();

    if (!title) {
      errorMessage.v = "title is required";
      return false;
    }

    saving.v = true;
    clearStatus();

    try {
      const payload = {
        title,
        note: formNote.v,
        category: parseTagString(formTags.v)
      };

      let saved: NoteSummary;

      if (editingId.v) {
        saved = await api.updateNote({
          id: editingId.v,
          ...payload
        });
      } else {
        saved = await api.createNote(payload);
      }

      dirty.v = false;
      editingId.v = saved._id;
      selected.v = {
        _id: saved._id,
        title,
        note: formNote.v,
        category: parseTagString(formTags.v)
      };
      await loadList();

      if (closeAfterSave) {
        await openNote(saved._id);
      }

      statusMessage.v = "Saved.";
      return true;
    } catch (error) {
      handleApiFailure(error, {
        commandMessage: "Session expired. Login again."
      });
      return false;
    } finally {
      saving.v = false;
    }
  };

  const deleteSelected = async () => {
    if (!selected.v) {
      return;
    }

    if (!requireWriteAccess()) {
      return;
    }

    if (!window.confirm("Delete this note?")) {
      return;
    }

    deleting.v = true;
    clearStatus();

    try {
      await api.deleteNote(selected.v._id);
      selected.v = null;
      editingId.v = null;
      mode.v = "list";
      setFormFromDetail(null);
      await loadList();
      statusMessage.v = "Deleted.";
    } catch (error) {
      handleApiFailure(error);
    } finally {
      deleting.v = false;
    }
  };

  const toggleFavorite = async (note: NoteSummary) => {
    if (!requireWriteAccess()) {
      return;
    }

    clearStatus();

    try {
      await api.updateNote({
        id: note._id,
        favorite: !note.favorite
      });

      await loadList();

      if (selected.v?._id === note._id) {
        selected.v = await api.getNote(note._id);
      }
    } catch (error) {
      handleApiFailure(error);
    }
  };

  const runSearch = async () => {
    await loadList();
  };

  const handleSearchKey = async (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      await runSearch();
    }
  };

  const quitCurrentPane = () => {
    if (mode.v === "write") {
      const previousMode = mode.v;
      cancelEdit();
      return previousMode !== mode.v;
    }

    if (mode.v === "view") {
      mode.v = "list";
      return true;
    }

    return false;
  };

  const runFooterCommand = async () => {
    const rawCommand = commandInput.v;
    const resolved = resolveExCommand(rawCommand, {
      mode: mode.v,
      hasSelection: Boolean(selected.v)
    });

    if (!resolved.ok) {
      setCommandStatus(resolved.message, true);
      return;
    }

    const route = resolved.route;
    commandInput.v = "";

    if (route.kind !== "quit" && !requireWriteAccess("Login first to run write commands.")) {
      return;
    }

    if (route.kind === "enter-write") {
      commandInputRef.value?.blur();
      if (route.source === "selected") {
        startEdit();
      } else {
        startCreate();
      }

      setCommandStatus(route.message);
      return;
    }

    if (route.kind === "quit") {
      const closed = quitCurrentPane();
      setCommandStatus(closed ? route.message : "Quit cancelled.", !closed);
      return;
    }

    if (route.kind === "save") {
      const saved = await saveNote({
        closeAfterSave: false
      });
      if (saved) {
        setCommandStatus(route.message);
        requestEditorFocus();
      } else if (!authExpired.v) {
        setCommandStatus("Save failed.", true);
      }
      return;
    }

    const savedAndClosed = await saveNote({
      closeAfterSave: true
    });
    if (savedAndClosed) {
      setCommandStatus(route.message);
    } else if (!authExpired.v) {
      setCommandStatus("Save failed.", true);
    }
  };

  mountCallback(() => {
    void loadList();
    void loadAuthStatus();

    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      if (!dirty.v) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    const commandShortcutHandler = (event: KeyboardEvent) => {
      if (event.key !== ":" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTextInputTarget(event.target)) {
        return;
      }

      event.preventDefault();
      focusCommandInput(":");
    };

    window.addEventListener("beforeunload", beforeUnloadHandler);
    window.addEventListener("keydown", commandShortcutHandler);

    return () => {
      if (syncFrameId) {
        cancelAnimationFrame(syncFrameId);
        syncFrameId = 0;
      }
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      window.removeEventListener("keydown", commandShortcutHandler);
    };
  });

  return () => {
    const previewBlocks = buildPreviewBlocks(formNote.v);

    return (
      <div className="app-shell theme-dark min-h-screen flex flex-col">
        <div className={`layout grid flex-1 min-h-0 ${mode.v === "write" ? "layout-write" : ""}`}>
          {mode.v !== "write" ? (
            <aside className="sidebar flex min-h-0 flex-col gap-3 p-4">
            <div className="panel-title">
              <h1>jmemo</h1>
              <p>lithent refactor</p>
            </div>

            <div className="toolbar grid gap-2">
              <input
                className="search-input"
                placeholder="Search title or tag"
                value={searchText.v}
                onInput={(event: InputEvent) => {
                  searchText.v = (event.target as HTMLInputElement).value;
                }}
                onKeyDown={handleSearchKey}
              />
              <button className="button" onClick={runSearch} disabled={listLoading.v}>
                Search
              </button>
              <button className="button primary" onClick={startCreate}>
                New
              </button>
            </div>

            <div className="auth-box rounded-xl">
              {authLoading.v ? <div className="hint">Checking auth...</div> : null}
              {!authLoading.v && authEnabled.v && !authenticated.v ? (
                <form
                  className="auth-form"
                  onSubmit={(event: Event) => {
                    event.preventDefault();
                    void login();
                  }}
                >
                  <input
                    className="text-input"
                    type="password"
                    placeholder="Password"
                    value={authPassword.v}
                    onInput={(event: InputEvent) => {
                      authPassword.v = (event.target as HTMLInputElement).value;
                    }}
                  />
                  <button className="button" type="submit">
                    Login
                  </button>
                </form>
              ) : null}
              {!authLoading.v && authEnabled.v && authenticated.v ? (
                <div className="auth-state">
                  <span className="hint">Authenticated</span>
                  <button className="button" onClick={logout}>
                    Logout
                  </button>
                </div>
              ) : null}
              {!authLoading.v && !authEnabled.v ? (
                <div className="hint">Auth disabled (set AUTH_PASSWORD to enable).</div>
              ) : null}
            </div>

            <div className="list-area flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
              {listLoading.v ? <div className="hint">Loading...</div> : null}
              {!listLoading.v && notes.v.length === 0 ? (
                <div className="hint">No notes found.</div>
              ) : null}
              {!listLoading.v &&
                notes.v.map((item) => (
                  <div
                    className={`list-item ${selected.v?._id === item._id ? "active" : ""}`}
                    key={item._id}
                  >
                    <button className="list-main" onClick={() => openNote(item._id)}>
                      <strong>{item.title || "(untitled)"}</strong>
                      <span className="tags">{item.category.join(", ") || "-"}</span>
                    </button>
                    <button
                      className={`favorite ${item.favorite ? "on" : ""}`}
                      onClick={() => toggleFavorite(item)}
                      title="Toggle favorite"
                    >
                      {item.favorite ? "★" : "☆"}
                    </button>
                  </div>
                ))}
            </div>
            </aside>
          ) : null}

          <main className={`content flex min-h-0 flex-col ${mode.v === "write" ? "content-write" : ""}`}>
            <header className="content-header flex items-center justify-between">
              <div>
                <strong>{mode.v === "write" ? "Write" : "View"}</strong>
              </div>
              <div className="header-actions flex gap-2">
                {mode.v === "view" ? (
                  <button className="button" onClick={startEdit} disabled={!selected.v}>
                    Edit
                  </button>
                ) : null}
                {mode.v === "view" ? (
                  <button className="button danger" onClick={deleteSelected} disabled={deleting.v}>
                    Delete
                  </button>
                ) : null}
                {mode.v === "write" ? (
                  <button
                    className="button primary"
                    onClick={() => {
                      void saveNote({
                        closeAfterSave: false
                      });
                    }}
                    disabled={saving.v}
                  >
                    {saving.v ? "Saving..." : "Save"}
                  </button>
                ) : null}
                {mode.v === "write" ? (
                  <button className="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </header>

            {errorMessage.v ? <div className="banner error">{errorMessage.v}</div> : null}
            {statusMessage.v ? <div className="banner ok">{statusMessage.v}</div> : null}
            {mode.v === "write" && !authLoading.v && authEnabled.v && !authenticated.v ? (
              <div className="auth-inline rounded-xl">
                <form
                  className="auth-form"
                  onSubmit={(event: Event) => {
                    event.preventDefault();
                    void login();
                  }}
                >
                  <input
                    className="text-input"
                    type="password"
                    placeholder="Password"
                    value={authPassword.v}
                    onInput={(event: InputEvent) => {
                      authPassword.v = (event.target as HTMLInputElement).value;
                    }}
                  />
                  <button className="button" type="submit">
                    Login
                  </button>
                </form>
              </div>
            ) : null}

            <div className="content-body flex min-h-0 flex-1 flex-col gap-3 overflow-auto pr-1">
              {mode.v === "list" ? (
                <section className="empty">
                  <p>Select a note from the left list or create a new note.</p>
                </section>
              ) : null}

              {mode.v === "view" ? (
                <section className="viewer rounded-xl">
                  {detailLoading.v ? <div className="hint">Loading note...</div> : null}
                  {!detailLoading.v && selected.v ? (
                    <div>
                      <h2>{selected.v.title}</h2>
                      <p className="meta">Tags: {selected.v.category.join(", ") || "-"}</p>
                      <div className="note-preview" innerHTML={renderMarkdownToHtml(selected.v.note)} />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {mode.v === "write" ? (
                <section className="editor-grid grid">
                  <div className="editor-panel rounded-xl">
                    <label>
                      Title
                      <input
                        className="text-input"
                        value={formTitle.v}
                        onInput={(event: InputEvent) => {
                          formTitle.v = (event.target as HTMLInputElement).value;
                          markDirty();
                        }}
                      />
                    </label>
                    <label>
                      Tags (comma separated)
                      <input
                        className="text-input"
                        value={formTags.v}
                        onInput={(event: InputEvent) => {
                          formTags.v = (event.target as HTMLInputElement).value;
                          markDirty();
                        }}
                      />
                    </label>
                    <label>
                      Note (Monaco + Vim)
                      <MonacoVimEditor
                        value={formNote.v}
                        focusSignal={editorFocusSignal.v}
                        onChange={(value) => {
                          formNote.v = value;
                          markDirty();

                          if (previewFollowBottom.v && Date.now() >= previewCooldownUntil.v) {
                            schedulePreviewSync(syncPreviewToBottom);
                          }
                        }}
                        onSave={() => {
                          void saveNote({
                            closeAfterSave: false
                          });
                        }}
                        onSaveAndClose={async () => {
                          await saveNote({
                            closeAfterSave: true
                          });
                        }}
                        onQuit={() => {
                          const closed = quitCurrentPane();
                          setCommandStatus(closed ? "Quit pane." : "Quit cancelled.", !closed);
                        }}
                        onCursorLineChange={handleEditorCursorLineChange}
                        onImageUpload={async (file) => {
                          if (!requireWriteAccess("Login required before uploading images.")) {
                            throw new Error("Authentication required");
                          }

                          const result = await api.uploadImage(file);
                          return result.filepath;
                        }}
                        onUploadError={(error) => {
                          handleApiFailure(error, {
                            authMessage: "Session expired. Please login and retry image upload."
                          });
                        }}
                      />
                    </label>
                  </div>
                  <div className="preview-panel rounded-xl">
                    <h3>Preview (line {editorCursorLine.v})</h3>
                    <div
                      className="preview-scroll"
                      ref={previewContainerRef}
                      onWheel={handlePreviewUserScroll}
                      onScroll={handlePreviewUserScroll}
                    >
                      {previewBlocks.map((block) => (
                        <div
                          className="preview-block"
                          key={`${block.start}-${block.end}`}
                          data-line-start={String(block.start)}
                          data-line-end={String(block.end)}
                        >
                          <div className="note-preview" innerHTML={renderMarkdownToHtml(block.text || " ")} />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          </main>
        </div>

        <footer className="command-footer sticky bottom-0 z-20">
          <div className={`command-mode mode-${mode.v}`}>{mode.v.toUpperCase()}</div>
          <form
            className="command-form flex items-center gap-2"
            onSubmit={(event: Event) => {
              event.preventDefault();
              void runFooterCommand();
            }}
          >
            <input
              ref={commandInputRef}
              className="command-input"
              value={commandInput.v}
              placeholder=":e  :q  :w  :wq"
              onInput={(event: InputEvent) => {
                commandInput.v = (event.target as HTMLInputElement).value;
              }}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === "Escape") {
                  commandInput.v = "";
                  (event.target as HTMLInputElement).blur();
                }
              }}
            />
            <button className="button" type="submit">
              Run
            </button>
          </form>
          <div className={`command-feedback ${commandFeedbackError.v ? "error" : ""}`}>
            {commandFeedback.v}
          </div>
        </footer>
      </div>
    );
  };
});
