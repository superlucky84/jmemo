export type VimWriteHandlers = {
  onSave?: () => void;
  onSaveAndClose?: () => void | Promise<void>;
};

type VimApiLike = {
  defineEx?: (name: string, shortName: string, callback: () => void) => void;
};

type VimModuleLike = {
  Vim?: VimApiLike;
};

let commandsRegistered = false;
let activeHandlers: VimWriteHandlers = {};

function runMaybePromise(value: void | Promise<void> | undefined) {
  if (!value || typeof (value as Promise<void>).then !== "function") {
    return;
  }

  void (value as Promise<void>).catch(() => {
    // save path already reports errors to the UI
  });
}

export function bindVimWriteCommands(
  vimModule: VimModuleLike | null | undefined,
  handlers: VimWriteHandlers
): boolean {
  activeHandlers = handlers;
  const vimApi = vimModule?.Vim;

  if (!vimApi?.defineEx) {
    return false;
  }

  if (commandsRegistered) {
    return true;
  }

  vimApi.defineEx("write", "w", () => {
    activeHandlers.onSave?.();
  });

  vimApi.defineEx("wq", "wq", () => {
    if (activeHandlers.onSaveAndClose) {
      runMaybePromise(activeHandlers.onSaveAndClose());
      return;
    }

    activeHandlers.onSave?.();
  });

  commandsRegistered = true;
  return true;
}

export function __resetVimWriteCommandsForTest() {
  commandsRegistered = false;
  activeHandlers = {};
}
