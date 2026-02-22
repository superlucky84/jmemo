import { mount, mountCallback, ref } from "lithent";
import { state } from "lithent/helper";
import { bindVimWriteCommands } from "./vim-commands";

type MonacoEditorModule = typeof import("monaco-editor/esm/vs/editor/editor.api");
type MonacoVimModule = typeof import("monaco-vim");
type MonacoEditorInstance = import("monaco-editor/esm/vs/editor/editor.api").editor.IStandaloneCodeEditor;

type EditorDisposable = {
  dispose: () => void;
};

type VimAdapterLike = {
  dispose?: () => void;
  state?: {
    vim?: {
      insertMode?: boolean;
    };
  };
};

export type MonacoVimEditorProps = {
  value: string;
  onChange: (value: string) => void;
  focusSignal?: number;
  onSave?: () => void;
  onSaveAndClose?: () => void | Promise<void>;
  onQuit?: () => void;
  onCursorLineChange?: (lineNumber: number) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onUploadError?: (error: unknown) => void;
};

function isMonacoRuntimeAvailable() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const userAgent = window.navigator?.userAgent?.toLowerCase() ?? "";
  if (userAgent.includes("jsdom")) {
    return false;
  }

  if ((import.meta as ImportMeta & { vitest?: boolean }).vitest) {
    return false;
  }

  return true;
}

function escapeMarkdownAltText(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[\[\]\(\)]/g, " ").trim() || "image";
}

function buildImageMarkdown(filepath: string, fileName: string) {
  return `![${escapeMarkdownAltText(fileName)}](${filepath})`;
}

function lineNumberFromOffset(value: string, offset: number) {
  const slice = value.slice(0, Math.max(0, offset));
  return slice.split("\n").length;
}

function insertAtSelection(value: string, start: number, end: number, insertedText: string) {
  return `${value.slice(0, start)}${insertedText}${value.slice(end)}`;
}

function toVimApi(module: MonacoVimModule | null) {
  return (module as {
    VimMode?: {
      Vim?: {
        handleKey?: (cm: unknown, key: string, origin?: string) => void;
        exitInsertMode?: (cm: unknown) => void;
      };
    };
  } | null)?.VimMode?.Vim;
}

export const MonacoVimEditor = mount<MonacoVimEditorProps>((renew, props) => {
  const hostRef = ref<HTMLDivElement | null>(null);
  const statusRef = ref<HTMLDivElement | null>(null);
  const fallbackInputRef = ref<HTMLTextAreaElement | null>(null);

  const fallbackMode = state(true, renew);
  const uploading = state(false, renew);
  const localMessage = state("", renew);

  let monacoEditorModule: MonacoEditorModule | null = null;
  let monacoVimModule: MonacoVimModule | null = null;
  let editor: MonacoEditorInstance | null = null;
  let vimAdapter: VimAdapterLike | null = null;
  const disposables: EditorDisposable[] = [];
  let syncingFromProps = false;
  let unmounted = false;
  let focusFrameId = 0;
  let pendingFocus = false;
  let pendingForceNormalMode = false;
  let lastFocusSignal = Number(props.focusSignal ?? 0) - 1;

  const updateCursorFromFallback = () => {
    const element = fallbackInputRef.value;
    if (!element) {
      props.onCursorLineChange?.(1);
      return;
    }

    props.onCursorLineChange?.(lineNumberFromOffset(element.value, element.selectionStart ?? 0));
  };

  const insertIntoFallback = (markdownText: string) => {
    const textarea = fallbackInputRef.value;

    if (!textarea) {
      props.onChange(`${props.value}${markdownText}`);
      return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const updatedText = insertAtSelection(textarea.value, start, end, markdownText);
    props.onChange(updatedText);

    const cursor = start + markdownText.length;
    requestAnimationFrame(() => {
      const input = fallbackInputRef.value;
      if (!input) {
        return;
      }

      input.focus();
      input.selectionStart = cursor;
      input.selectionEnd = cursor;
      props.onCursorLineChange?.(lineNumberFromOffset(input.value, cursor));
    });
  };

  const insertIntoMonaco = (markdownText: string) => {
    if (!editor || !monacoEditorModule) {
      return;
    }

    const position = editor.getPosition();
    if (!position) {
      return;
    }

    const range = new monacoEditorModule.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    );

    editor.executeEdits("drop-image", [{ range, text: markdownText }]);
    editor.focus();
  };

  const handleImageDrop = async (file: File) => {
    if (!props.onImageUpload) {
      return;
    }

    uploading.v = true;
    localMessage.v = "";

    try {
      const filepath = await props.onImageUpload(file);
      const markdownText = buildImageMarkdown(filepath, file.name);

      if (fallbackMode.v) {
        insertIntoFallback(markdownText);
      } else {
        insertIntoMonaco(markdownText);
      }
    } catch (error) {
      localMessage.v = error instanceof Error ? error.message : String(error);
      props.onUploadError?.(error);
    } finally {
      uploading.v = false;
    }
  };

  const ensureVimNormalMode = () => {
    const vimApi = toVimApi(monacoVimModule);
    if (!vimApi?.handleKey || !vimAdapter) {
      return;
    }

    try {
      if (vimAdapter.state?.vim?.insertMode && vimApi.exitInsertMode) {
        vimApi.exitInsertMode(vimAdapter);
      }
      vimApi.handleKey(vimAdapter, "<Esc>", "api");
    } catch {
      // no-op: keep editor usable even if vim API internals change
    }
  };

  const focusEditorSurface = (forceNormalMode = false) => {
    if (fallbackMode.v) {
      const textarea = fallbackInputRef.value;
      if (!textarea) {
        return false;
      }

      textarea.focus();
      props.onCursorLineChange?.(lineNumberFromOffset(textarea.value, textarea.selectionStart ?? 0));
      return true;
    }

    if (!editor) {
      return false;
    }

    editor.focus();
    if (forceNormalMode) {
      ensureVimNormalMode();
    }
    return true;
  };

  const flushFocusRequest = () => {
    if (focusFrameId || unmounted) {
      return;
    }

    focusFrameId = requestAnimationFrame(() => {
      focusFrameId = 0;
      if (!pendingFocus) {
        return;
      }

      if (focusEditorSurface(pendingForceNormalMode)) {
        pendingFocus = false;
        pendingForceNormalMode = false;
        return;
      }

      flushFocusRequest();
    });
  };

  const requestEditorFocus = (forceNormalMode = false) => {
    pendingFocus = true;
    pendingForceNormalMode = pendingForceNormalMode || forceNormalMode;

    if (focusEditorSurface(pendingForceNormalMode)) {
      pendingFocus = false;
      pendingForceNormalMode = false;
      return;
    }

    flushFocusRequest();
  };

  const requestEditorFocusAfterWriteEnter = () => {
    requestAnimationFrame(() => {
      requestEditorFocus(true);
    });
  };

  const syncEditorFromProp = () => {
    if (!editor || fallbackMode.v) {
      return;
    }

    bindVimWriteCommands(
      {
        Vim: (monacoVimModule as { VimMode?: { Vim?: unknown } } | null)?.VimMode?.Vim as {
          defineEx?: (name: string, shortName: string, callback: () => void) => void;
        }
      },
      {
        onSave: props.onSave,
        onSaveAndClose: props.onSaveAndClose,
        onQuit: props.onQuit
      }
    );

    const incoming = String(props.value ?? "");
    if (incoming === editor.getValue()) {
      return;
    }

    syncingFromProps = true;
    editor.setValue(incoming);
    syncingFromProps = false;
  };

  mountCallback(() => {
    props.onCursorLineChange?.(1);
    requestEditorFocus(true);

    if (!isMonacoRuntimeAvailable()) {
      fallbackMode.v = true;
      return;
    }

    const hostElement = hostRef.value;
    if (!hostElement) {
      fallbackMode.v = true;
      return;
    }

    void (async () => {
      try {
        const [monacoLoaded, monacoVimLoaded] = await Promise.all([
          import("monaco-editor/esm/vs/editor/editor.api"),
          import("monaco-vim"),
          import("monaco-editor/min/vs/editor/editor.main.css"),
          import("monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js")
        ]);

        if (unmounted) {
          return;
        }

        monacoEditorModule = monacoLoaded;
        monacoVimModule = monacoVimLoaded;

        bindVimWriteCommands(
          {
            Vim: (monacoVimModule as { VimMode?: { Vim?: unknown } }).VimMode?.Vim as {
              defineEx?: (name: string, shortName: string, callback: () => void) => void;
            }
          },
          {
            onSave: props.onSave,
            onSaveAndClose: props.onSaveAndClose,
            onQuit: props.onQuit
          }
        );

        editor = monacoLoaded.editor.create(hostElement, {
          value: String(props.value ?? ""),
          language: "markdown",
          theme: "vs-dark",
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbersMinChars: 4,
          lineHeight: 22,
          scrollBeyondLastLine: false,
          wordWrap: "on"
        });

        disposables.push(
          editor.onDidChangeModelContent(() => {
            if (syncingFromProps || !editor) {
              return;
            }

            props.onChange(editor.getValue());
          }),
          editor.onDidChangeCursorPosition((event: { position: { lineNumber: number } }) => {
            props.onCursorLineChange?.(event.position.lineNumber);
          })
        );

        editor.addCommand(monacoLoaded.KeyMod.CtrlCmd | monacoLoaded.KeyCode.KeyS, () => {
          props.onSave?.();
        });

        const statusNode = statusRef.value;
        vimAdapter = monacoVimLoaded.initVimMode(editor, statusNode ?? null);
        fallbackMode.v = false;
        ensureVimNormalMode();
        requestEditorFocusAfterWriteEnter();
        props.onCursorLineChange?.(editor.getPosition()?.lineNumber ?? 1);
      } catch (error) {
        fallbackMode.v = true;
        localMessage.v = "Monaco를 불러오지 못해 기본 입력 모드로 전환되었습니다.";
        props.onUploadError?.(error);
      }
    })();

    return () => {
      unmounted = true;
      if (focusFrameId) {
        cancelAnimationFrame(focusFrameId);
        focusFrameId = 0;
      }
      vimAdapter?.dispose?.();
      disposables.splice(0).forEach((disposable) => {
        disposable.dispose();
      });
      editor?.dispose();
    };
  });

  return () => {
    syncEditorFromProp();
    const focusSignal = Number(props.focusSignal ?? 0);
    if (focusSignal !== lastFocusSignal) {
      lastFocusSignal = focusSignal;
      requestEditorFocus(true);
    }

    return (
      <div
        className="monaco-vim-wrapper"
        onDragOver={(event: DragEvent) => {
          event.preventDefault();
        }}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          const file = event.dataTransfer?.files?.[0];
          if (!file) {
            return;
          }

          void handleImageDrop(file);
        }}
      >
        <div className={`monaco-editor-host ${fallbackMode.v ? "hidden" : ""}`} ref={hostRef} />
        <textarea
          ref={fallbackInputRef}
          className={`note-input ${fallbackMode.v ? "" : "hidden"}`}
          value={props.value}
          onInput={(event: InputEvent) => {
            props.onChange((event.target as HTMLTextAreaElement).value);
            updateCursorFromFallback();
          }}
          onClick={updateCursorFromFallback}
          onKeyUp={updateCursorFromFallback}
          onKeyDown={(event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              props.onSave?.();
            }
          }}
        />
        <div className="monaco-vim-status" ref={statusRef}>
          {fallbackMode.v ? "Fallback editor mode (Vim disabled)" : "Vim mode ready"}
        </div>
        {uploading.v ? <div className="hint">Uploading image...</div> : null}
        {localMessage.v ? <div className="hint">{localMessage.v}</div> : null}
      </div>
    );
  };
});
