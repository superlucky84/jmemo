type ViewMode = "list" | "view" | "write";

export type ExRoute =
  | {
      kind: "enter-write";
      source: "selected" | "new";
      command: "e";
      message: string;
    }
  | {
      kind: "quit";
      command: "q";
      message: string;
    }
  | {
      kind: "save";
      command: "w";
      message: string;
    }
  | {
      kind: "save-and-close";
      command: "wq";
      message: string;
    };

export type ExRouteResult =
  | {
      ok: true;
      route: ExRoute;
    }
  | {
      ok: false;
      message: string;
    };

export type ExContext = {
  mode: ViewMode;
  hasSelection: boolean;
};

function normalizeCommand(input: string) {
  const trimmed = String(input ?? "").trim();
  const withoutPrefix = trimmed.startsWith(":") ? trimmed.slice(1) : trimmed;
  return withoutPrefix.split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function resolveExCommand(input: string, context: ExContext): ExRouteResult {
  const command = normalizeCommand(input);

  if (!command) {
    return {
      ok: false,
      message: "Command is empty."
    };
  }

  if (command === "e" || command === "edit") {
    if (context.mode === "write") {
      return {
        ok: false,
        message: "Already in write mode."
      };
    }

    return {
      ok: true,
      route: {
        kind: "enter-write",
        source: context.hasSelection ? "selected" : "new",
        command: "e",
        message: context.hasSelection ? "Enter write mode." : "Create new note."
      }
    };
  }

  if (command === "q" || command === "quit") {
    if (context.mode === "list") {
      return {
        ok: false,
        message: "Already in list mode."
      };
    }

    return {
      ok: true,
      route: {
        kind: "quit",
        command: "q",
        message: "Quit current pane."
      }
    };
  }

  if (command === "w" || command === "write") {
    if (context.mode !== "write") {
      return {
        ok: false,
        message: ":w is available only in write mode."
      };
    }

    return {
      ok: true,
      route: {
        kind: "save",
        command: "w",
        message: "Save note."
      }
    };
  }

  if (command === "wq" || command === "x") {
    if (context.mode !== "write") {
      return {
        ok: false,
        message: ":wq is available only in write mode."
      };
    }

    return {
      ok: true,
      route: {
        kind: "save-and-close",
        command: "wq",
        message: "Save and close."
      }
    };
  }

  return {
    ok: false,
    message: `Unknown command: ${command}`
  };
}
