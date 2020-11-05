import { randomBytes } from "crypto"
import { SHA256 } from "crypto-js"
import { app } from "electron"
import { ensureDir, mkdir, pathExists } from "fs-extra"
import { action, observable, toJS } from "mobx"
import path from "path"
import { BaseStore } from "../common/base-store"

interface FSProvisionModel {
  extensions: Record<string, string>; // extension names to paths
}

export class FilesystemProvisionerStore extends BaseStore<FSProvisionModel> {
  @observable registeredExtensions = new Map<string, string>()

  private constructor() {
    super({
      configName: "lens-filesystem-provisioner-store",
      accessPropertiesByDotNotation: false, // To make dots safe in cluster context names
    });
  }

  /**
   * This function retrieves the saved path to the folder which the extension
   * can saves files to. If the folder is not present then it is created.
   * @param extensionName the name of the extension requesting the path
   * @returns path to the folder that the extension can safely write files to.
   */
  async requestDirectory(extensionName: string): Promise<string> {
    if (!this.registeredExtensions.has(extensionName)) {
      const salt = randomBytes(32).toString("hex")
      const hashedName = SHA256(`${extensionName}/${salt}`).toString()
      const dirPath = path.resolve(app.getPath("userData"), "extension_data", hashedName)
      this.registeredExtensions.set(extensionName, dirPath)
    }

    const dirPath = this.registeredExtensions.get(extensionName)
    await ensureDir(dirPath)
    return dirPath
  }

  @action
  protected fromStore({ extensions }: FSProvisionModel = { extensions: {} }): void {
    for (const extension in extensions) {
      this.registeredExtensions.set(extension, extensions[extension])
    }
  }

  toJSON(): FSProvisionModel {
    return toJS({
      extensions: Object.fromEntries(this.registeredExtensions.entries()),
    }, {
      recurseEverything: true
    })
  }
}

export const filesystemProvisionerStore = FilesystemProvisionerStore.getInstance<FilesystemProvisionerStore>()
