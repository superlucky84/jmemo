import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetVimWriteCommandsForTest, bindVimWriteCommands } from "../../src/features/editor/vim-commands";

type RegisteredCommand = {
  name: string;
  shortName: string;
  callback: () => void;
};

function createVimModuleMock() {
  const commands: RegisteredCommand[] = [];

  return {
    commands,
    vimModule: {
      Vim: {
        defineEx(name: string, shortName: string, callback: () => void) {
          commands.push({ name, shortName, callback });
        }
      }
    }
  };
}

describe("bindVimWriteCommands", () => {
  beforeEach(() => {
    __resetVimWriteCommandsForTest();
  });

  it("registers :w and :wq once", () => {
    const { commands, vimModule } = createVimModuleMock();
    const save = vi.fn();
    const saveAndClose = vi.fn();

    expect(bindVimWriteCommands(vimModule, { onSave: save, onSaveAndClose: saveAndClose })).toBe(true);
    expect(bindVimWriteCommands(vimModule, { onSave: save, onSaveAndClose: saveAndClose })).toBe(true);

    expect(commands.map((item) => item.shortName)).toEqual(["w", "wq"]);
  });

  it("executes latest onSave handler for :w", () => {
    const { commands, vimModule } = createVimModuleMock();
    const oldSave = vi.fn();
    const nextSave = vi.fn();

    bindVimWriteCommands(vimModule, { onSave: oldSave });
    bindVimWriteCommands(vimModule, { onSave: nextSave });
    commands.find((item) => item.shortName === "w")?.callback();

    expect(oldSave).not.toHaveBeenCalled();
    expect(nextSave).toHaveBeenCalledTimes(1);
  });

  it("executes onSaveAndClose for :wq when provided", async () => {
    const { commands, vimModule } = createVimModuleMock();
    const save = vi.fn();
    const saveAndClose = vi.fn(async () => {});

    bindVimWriteCommands(vimModule, { onSave: save, onSaveAndClose: saveAndClose });
    commands.find((item) => item.shortName === "wq")?.callback();
    await Promise.resolve();

    expect(saveAndClose).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("returns false when Vim API is missing", () => {
    expect(bindVimWriteCommands({}, {})).toBe(false);
  });
});
