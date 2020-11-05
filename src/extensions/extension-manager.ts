import type { LensExtensionId, LensExtensionManifest } from "./lens-extension"
import path from "path"
import os from "os"
import child_process from "child_process";
import fse from "fs-extra"
import logger from "../main/logger"
import { extensionPackagesRoot } from "./extension-loader"
import { getBundledExtensions } from "../common/utils/app-version"

export interface InstalledExtension {
  readonly manifest: LensExtensionManifest;
  readonly manifestPath: string;
  readonly isBundled: boolean; // defined in project root's package.json
  isEnabled: boolean;
}

type Dependencies = {
  [name: string]: string;
}

type PackageJson = {
  dependencies: Dependencies;
}

export class ExtensionManager {

  protected bundledFolderPath: string

  protected packagesJson: PackageJson = {
    dependencies: {}
  }

  get extensionPackagesRoot() {
    return extensionPackagesRoot()
  }

  get inTreeTargetPath() {
    return path.join(this.extensionPackagesRoot, "extensions")
  }

  get inTreeFolderPath(): string {
    return path.resolve(__static, "../extensions");
  }

  get nodeModulesPath(): string {
    return path.join(this.extensionPackagesRoot, "node_modules")
  }

  get localFolderPath(): string {
    return path.join(os.homedir(), ".k8slens", "extensions");
  }

  get npmPath() {
    return __non_webpack_require__.resolve('npm/bin/npm-cli')
  }

  get packageJsonPath() {
    return path.join(this.extensionPackagesRoot, "package.json")
  }

  async load(): Promise<Map<LensExtensionId, InstalledExtension>> {
    logger.info("[EXTENSION-MANAGER] loading extensions from " + this.extensionPackagesRoot)
    if (await fse.pathExists(path.join(this.extensionPackagesRoot, "package-lock.json"))) {
      await fse.remove(path.join(this.extensionPackagesRoot, "package-lock.json"))
    }
    try {
      await fse.access(this.inTreeFolderPath, fse.constants.W_OK)
      this.bundledFolderPath = this.inTreeFolderPath
    } catch {
      // we need to copy in-tree extensions so that we can symlink them properly on "npm install"
      await fse.remove(this.inTreeTargetPath)
      await fse.ensureDir(this.inTreeTargetPath)
      await fse.copy(this.inTreeFolderPath, this.inTreeTargetPath)
      this.bundledFolderPath = this.inTreeTargetPath
    }
    await fse.ensureDir(this.nodeModulesPath)
    await fse.ensureDir(this.localFolderPath)
    return await this.loadExtensions();
  }

  protected async getByManifest(manifestPath: string, { isBundled = false } = {}): Promise<InstalledExtension> {
    let manifestJson: LensExtensionManifest;
    try {
      await fse.access(manifestPath, fse.constants.F_OK); // check manifest file for existence
      manifestJson = __non_webpack_require__(manifestPath)
      this.packagesJson.dependencies[manifestJson.name] = path.dirname(manifestPath)

      logger.info("[EXTENSION-MANAGER] installed extension " + manifestJson.name)
      return {
        manifestPath: path.join(this.nodeModulesPath, manifestJson.name, "package.json"),
        manifest: manifestJson,
        isBundled: isBundled,
        isEnabled: isBundled,
      }
    } catch (err) {
      logger.error(`[EXTENSION-MANAGER]: can't install extension at ${manifestPath}: ${err}`, { manifestJson });
    }
  }

  protected installPackages(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = child_process.fork(this.npmPath, ["install", "--silent", "--no-audit", "--only=prod", "--prefer-offline", "--no-package-lock"], {
        cwd: extensionPackagesRoot(),
        silent: true
      })
      child.on("close", () => {
        resolve()
      })
      child.on("error", (err) => {
        reject(err)
      })
    })
  }

  async loadExtensions() {
    const bundledExtensions = await this.loadBundledExtensions()
    const localExtensions = await this.loadFromFolder(this.localFolderPath)
    await fse.writeFile(path.join(this.packageJsonPath), JSON.stringify(this.packagesJson, null, 2), { mode: 0o600 })
    await this.installPackages()
    const extensions = bundledExtensions.concat(localExtensions)
    return new Map(extensions.map(ext => [ext.manifestPath, ext]));
  }

  async loadBundledExtensions() {
    const extensions: InstalledExtension[] = []
    const folderPath = this.bundledFolderPath
    const bundledExtensions = getBundledExtensions()
    const paths = await fse.readdir(folderPath);
    for (const fileName of paths) {
      if (!bundledExtensions.includes(fileName)) {
        continue
      }
      const absPath = path.resolve(folderPath, fileName);
      const manifestPath = path.resolve(absPath, "package.json");
      const ext = await this.getByManifest(manifestPath, { isBundled: true }).catch(() => null)
      if (ext) {
        extensions.push(ext)
      }
    }
    logger.debug(`[EXTENSION-MANAGER]: ${extensions.length} extensions loaded`, { folderPath, extensions });
    return extensions
  }

  async loadFromFolder(folderPath: string): Promise<InstalledExtension[]> {
    const bundledExtensions = getBundledExtensions()
    const extensions: InstalledExtension[] = []
    const paths = await fse.readdir(folderPath);
    for (const fileName of paths) {
      if (bundledExtensions.includes(fileName)) { // do no allow to override bundled extensions
        continue
      }
      const absPath = path.resolve(folderPath, fileName);
      if (!(await fse.pathExists(absPath))) {
        continue
      }
      const lstat = await fse.lstat(absPath)
      if (!lstat.isDirectory() && !lstat.isSymbolicLink()) { // skip non-directories
        continue
      }

      try {
        const manifestPath = path.resolve(absPath, "package.json");
        extensions.push(await this.getByManifest(manifestPath))
      } catch (_err) {
        // ignore error
      }
    }

    logger.debug(`[EXTENSION-MANAGER]: ${extensions.length} extensions loaded`, { folderPath, extensions });
    return extensions;
  }
}

export const extensionManager = new ExtensionManager()
