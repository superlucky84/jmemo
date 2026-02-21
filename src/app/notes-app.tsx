import { mount, mountCallback, ref } from "lithent";
import { state } from "lithent/helper";
import { NotesApiError, notesApi, type NotesApi } from "../features/notes/api/notes-api";
import type { NoteDetail, NoteSummary } from "../features/notes/types";
import { MonacoVimEditor } from "../features/editor/monaco-vim-editor";
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

  const notes = state<NoteSummary[]>([], renew);
  const selected = state<NoteDetail | null>(null, renew);
  const editingId = state<string | null>(null, renew);

  const formTitle = state("", renew);
  const formTags = state("", renew);
  const formNote = state("", renew);
  const dirty = state(false, renew);
  const editorCursorLine = state(1, renew);

  const previewContainerRef = ref<HTMLElement | null>(null);
  const previewCooldownUntil = state(0, renew);

  let lastSyncedLine = 0;
  let lastSyncedBlockStart = -1;
  let syncFrameId = 0;
  let programmaticScrollLock = false;

  const clearStatus = () => {
    errorMessage.v = "";
    statusMessage.v = "";
  };

  const setFailure = (error: unknown) => {
    errorMessage.v = toDisplayError(error);
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
    pauseAutoSyncTemporarily();
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

    if (lineNumber === lastSyncedLine) {
      return;
    }

    if (Date.now() < previewCooldownUntil.v) {
      return;
    }

    lastSyncedLine = lineNumber;

    if (syncFrameId) {
      cancelAnimationFrame(syncFrameId);
    }

    syncFrameId = requestAnimationFrame(() => {
      syncPreviewToLine(lineNumber);
      syncFrameId = 0;
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

  const openNote = async (id: string) => {
    mode.v = "view";
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

  const startCreate = () => {
    mode.v = "write";
    editingId.v = null;
    selected.v = null;
    setFormFromDetail(null);
    dirty.v = false;
    clearStatus();
  };

  const startEdit = () => {
    if (!selected.v) {
      return;
    }

    mode.v = "write";
    editingId.v = selected.v._id;
    setFormFromDetail(selected.v);
    dirty.v = false;
    clearStatus();
  };

  const cancelEdit = () => {
    if (dirty.v && !window.confirm("Unsaved changes will be lost. Continue?")) {
      return;
    }

    dirty.v = false;
    clearStatus();

    if (selected.v) {
      mode.v = "view";
      setFormFromDetail(selected.v);
      return;
    }

    mode.v = "list";
    setFormFromDetail(null);
  };

  const saveNote = async () => {
    const title = formTitle.v.trim();

    if (!title) {
      errorMessage.v = "title is required";
      return;
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
      await loadList();
      await openNote(saved._id);
      statusMessage.v = "Saved.";
    } catch (error) {
      setFailure(error);
    } finally {
      saving.v = false;
    }
  };

  const deleteSelected = async () => {
    if (!selected.v) {
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
      setFailure(error);
    } finally {
      deleting.v = false;
    }
  };

  const toggleFavorite = async (note: NoteSummary) => {
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
      setFailure(error);
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

  mountCallback(() => {
    void loadList();

    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      if (!dirty.v) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnloadHandler);

    return () => {
      if (syncFrameId) {
        cancelAnimationFrame(syncFrameId);
        syncFrameId = 0;
      }
      window.removeEventListener("beforeunload", beforeUnloadHandler);
    };
  });

  return () => {
    const previewBlocks = buildPreviewBlocks(formNote.v);

    return (
      <div className="layout">
      <aside className="sidebar">
        <div className="panel-title">
          <h1>jmemo</h1>
          <p>lithent refactor</p>
        </div>

        <div className="toolbar">
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

        <div className="list-area">
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

      <main className="content">
        <header className="content-header">
          <div>
            <strong>{mode.v === "write" ? "Write" : "View"}</strong>
          </div>
          <div className="header-actions">
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
              <button className="button primary" onClick={saveNote} disabled={saving.v}>
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

        {mode.v === "list" ? (
          <section className="empty">
            <p>Select a note from the left list or create a new note.</p>
          </section>
        ) : null}

        {mode.v === "view" ? (
          <section className="viewer">
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
            <section className="editor-grid">
              <div className="editor-panel">
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
                    onChange={(value) => {
                      formNote.v = value;
                      markDirty();
                    }}
                    onSave={() => {
                      void saveNote();
                    }}
                    onSaveAndClose={async () => {
                      await saveNote();
                      mode.v = "view";
                    }}
                    onCursorLineChange={handleEditorCursorLineChange}
                    onImageUpload={async (file) => {
                      const result = await api.uploadImage(file);
                      return result.filepath;
                    }}
                    onUploadError={setFailure}
                  />
                </label>
              </div>
              <div className="preview-panel">
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
      </main>
      </div>
    );
  };
});
