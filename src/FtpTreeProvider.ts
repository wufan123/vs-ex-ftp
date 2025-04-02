import * as vscode from "vscode";
import * as ftp from "basic-ftp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { BrowserOpener } from "./BrowserOpener";
const { localize } = require("vscode-nls-i18n");
class FTPClientWrapper {
  private client: ftp.Client;
  private isConnecting: boolean = false;
  private host: string;
  constructor() {
    this.client = new ftp.Client();
    this.client.ftp.verbose = true;
  }
  public getHost() {
    return this.host;
  }

  async connect(): Promise<void> {
    // 防止并发连接
    if (this.isConnecting || !this.client.closed) return;
    this.isConnecting = true;
    const config = vscode.workspace.getConfiguration("ftpClient");
    const host = config.get<string>("1.host", "");
    const user = config.get<string>("2.user", "");
    const password = config.get<string>("3.password", "");
    const secure = config.get<boolean>("6.secure", false);
    if (!host || !user || !password) {
      let missingFields = [];
      if (!host) missingFields.push("host");
      if (!user) missingFields.push("user");
      if (!password) missingFields.push("password");
      let parStr = missingFields.join(", ");
      let errMessage = localize("ftp.connection.error.notConfigured", parStr);
      // vscode.window.showErrorMessage(errMessage);
      this.isConnecting = false;
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "ftpClient"
      );
      vscode.commands.executeCommand(
        "setContext",
        "ftpExplorer.connected",
        false
      );
      throw new Error(errMessage);
    }
    this.host = host;
    try {
      await this.client.access({
        host,
        user,
        password,
        secure,
      });
      vscode.commands.executeCommand(
        "setContext",
        "ftpExplorer.connected",
        true
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        localize("ftp.connection.error", error.message)
      );
      vscode.commands.executeCommand(
        "setContext",
        "ftpExplorer.connected",
        false
      );
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async list(directoryPath: string = "/"): Promise<ftp.FileInfo[]> {
    await this.connect(); // 确保连接建立
    return this.client.list(directoryPath);
  }

  async downloadToTempFile(remotePath: string): Promise<string | undefined> {
    await this.connect(); // 确保连接建立
    const tempFilePath = path.join(os.tmpdir(), path.basename(remotePath));
    const cancellationTokenSource = new vscode.CancellationTokenSource();

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: localize("ftp.provider.downloading", path.basename(remotePath)),
        cancellable: true,
      },
      async (progress, token) => {
        try {
          token.onCancellationRequested(() => {
            cancellationTokenSource.cancel();
            vscode.window.showWarningMessage(
              localize("ftp.provider.downloadCancelled")
            );
          });

          await this.downloadFile(
            remotePath,
            os.tmpdir(),
            progress,
            cancellationTokenSource.token
          );

          return tempFilePath;
        } catch (error) {
          if (!cancellationTokenSource.token.isCancellationRequested) {
            vscode.window.showErrorMessage(
              localize("ftp.provider.downloadFailed", error.message)
            );
          }
          return undefined; // 下载失败或取消时返回 undefined
        } finally {
          cancellationTokenSource.dispose(); // 释放资源
        }
      }
    );
  }
  public async downloadDirectory(
    remotePath: string,
    localDir: string,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken
  ) {
    await this.connect();
    const folderName = path.basename(remotePath);
    const localFolderPath = path.join(localDir, folderName);
    fs.mkdirSync(localFolderPath, { recursive: true });

    await this._downloadDirectoryRecursively(
      remotePath,
      localFolderPath,
      progress,
      token
    );
  }

  private async _downloadDirectoryRecursively(
    remotePath: string,
    localDir: string,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken
  ) {
    await this.connect();
    const remoteItems = await this.client.list(remotePath);

    for (const item of remoteItems) {
      if (token.isCancellationRequested) {
        break; // 取消任务，跳出循环
      }

      const itemRemotePath = path.join(remotePath, item.name);
      const itemLocalPath = path.join(localDir, item.name);

      if (item.isDirectory) {
        fs.mkdirSync(itemLocalPath, { recursive: true });
        await this._downloadDirectoryRecursively(
          itemRemotePath,
          itemLocalPath,
          progress,
          token
        );
      } else {
        await this.downloadFile(itemRemotePath, localDir, progress, token);
      }
    }
  }
  private formatFileSize(size: number): string {
    if (size <= 0) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    if (size < 1024 * 1024 * 1024)
      return `${(size / 1024 / 1024).toFixed(2)} MB`;
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  // 下载文件
  public async downloadFile(
    remotePath: string,
    localDir: string,
    progress: vscode.Progress<{ message?: string }>,
    token: vscode.CancellationToken
  ) {
    await this.connect();
    const localFilePath = path.join(localDir, path.basename(remotePath));

    let downloadedBytes = 0;
    let fileSize = 0;

    // 获取远程文件大小
    try {
      fileSize = await this.client.size(remotePath); // 如果支持 `size` 方法获取文件大小
    } catch (error) {
      console.warn(`Unable to fetch file size for ${remotePath}`, error);
    }

    // 设置取消标记
    const cancellationPromise = new Promise<void>((_, reject) => {
      token.onCancellationRequested(() => {
        this.client.close(); // 尝试关闭连接
        reject(new Error("Download cancelled by user."));
      });
    });

    // 设置进度追踪
    this.client.trackProgress((info) => {
      if (token.isCancellationRequested) {
        return; // 停止更新
      }
      downloadedBytes = info.bytesOverall;
      const percent = fileSize
        ? ((downloadedBytes / fileSize) * 100).toFixed(2)
        : "unknown"; // 如果文件大小未知，显示 `unknown`
      const fileSizeFormatted = fileSize
        ? this.formatFileSize(fileSize)
        : "unknown"; // 文件大小格式化
      const downloadedSizeFormatted = this.formatFileSize(downloadedBytes); // 已下载大小格式化

      progress.report({
        message: `${path.basename(
          remotePath
        )} - ${downloadedSizeFormatted}/${fileSizeFormatted} (${percent}%)`,
      });
    });

    // 检查是否取消
    if (token.isCancellationRequested) {
      return; // 取消下载
    }

    try {
      // 包装下载任务和取消逻辑
      await Promise.race([
        this.client.downloadTo(localFilePath, remotePath), // 下载任务
        cancellationPromise, // 取消逻辑
      ]);
    } catch (error) {
      if (token.isCancellationRequested) {
        console.warn("Download was cancelled.");
      } else {
        console.error(
          `Failed to download file: ${remotePath} to ${localFilePath}:`,
          error
        );
        throw error;
      }
    } finally {
      this.client.trackProgress(); // 停止进度追踪
    }
  }

  // 删除文件
  public async removeFile(remotePath: string): Promise<void> {
    await this.connect();
    await this.client.remove(remotePath);
  }

  // 删除目录
  public async removeDirectory(remotePath: string): Promise<void> {
    await this.connect();
    await this.client.removeDir(remotePath);
  }

  // 上传文件
  public async uploadFile(
    localPath: string,
    remotePath: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>,
    token: vscode.CancellationToken
  ) {
    await this.connect();
    const fileSize = fs.statSync(localPath).size; // 获取文件大小
    let uploadedBytes = 0;

    // 设置取消标记
    const cancellationPromise = new Promise<void>((_, reject) => {
      token.onCancellationRequested(() => {
        this.client.close(); // 尝试关闭连接
        reject(new Error("Upload cancelled by user."));
      });
    });

    // 设置进度追踪
    this.client.trackProgress((info) => {
      if (token.isCancellationRequested) {
        return; // 停止更新
      }
      uploadedBytes = info.bytesOverall;
      const percent = ((uploadedBytes / fileSize) * 100).toFixed(2); // 百分比
      const fileSizeFormatted = this.formatFileSize(fileSize); // 总大小格式化
      const uploadedSizeFormatted = this.formatFileSize(uploadedBytes); // 已上传大小格式化

      progress?.report({
        message: `${path.basename(
          localPath
        )} - ${uploadedSizeFormatted}/${fileSizeFormatted} (${percent}%)`,
      });
    });

    if (token.isCancellationRequested) {
      return; // 取消
    }

    try {
      // 包装上传任务和取消逻辑
      await Promise.race([
        this.client.uploadFrom(localPath, remotePath), // 上传任务
        cancellationPromise, // 取消逻辑
      ]);
    } catch (error) {
      if (token.isCancellationRequested) {
        console.warn("Upload was cancelled.");
      } else {
        console.error(
          `Failed to upload file: ${localPath} to ${remotePath}:`,
          error
        );
        throw error;
      }
    } finally {
      this.client.trackProgress(); // 停止追踪进度
    }
  }

  // 上传文件夹
  public async uploadDirectory(
    localDir: string,
    remoteDir: string,
    progress?: vscode.Progress<{ increment?: number }>
  ) {
    await this.connect();
    try {
      await this.client.uploadFromDir(localDir, remoteDir);
    } catch (error) {
      console.error(
        `Failed to upload directory: ${localDir} to ${remoteDir}:`,
        error
      );
      throw error;
    }
  }

  // 创建目录，必要时递归创建父级目录
  public async createDirectory(remotePath: string): Promise<void> {
    await this.connect();
    try {
      // 检查目录是否存在，不存在则创建
      await this.client.ensureDir(remotePath);
    } catch (error) {
      console.error(
        `Failed to create directory ${remotePath}: ${error.message}`
      );
      throw error;
    }
  }

  close(): void {
    if (!this.client.closed) {
      this.client.close();
    }
  }
}

export class FtpTreeProvider implements vscode.TreeDataProvider<FtpItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FtpItem | undefined> =
    new vscode.EventEmitter<FtpItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<FtpItem | undefined> =
    this._onDidChangeTreeData.event;

  public ftpClient: FTPClientWrapper;
  private currentPath: string = "/";
  private currentRootPath: string = "/";
  public isBusy: boolean = false;

  constructor() {
    this.ftpClient = new FTPClientWrapper();
    const config = vscode.workspace.getConfiguration("ftpClient");
    this.currentPath = this.currentRootPath = config.get<string>("4.path", "/");
    vscode.commands.executeCommand(
      "setContext",
      "ftpExplorer.refreshEnabled",
      true
    );
  }

  public connectFTP() {
    this.ftpClient.connect();
  }

  public getCurrentRootPath() {
    return this.currentRootPath;
  }

  public async downloadToDirectory(item: FtpItem) {
    const folderUris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: localize("ftp.provider.selectDestinationDirectory"), // 更新本地化前缀
    });

    if (folderUris && folderUris[0]) {
      const targetDir = folderUris[0].fsPath;
      const sourcePath = item.path;
      const cancellationTokenSource = new vscode.CancellationTokenSource();

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: localize("ftp.provider.downloading", item.label), // 更新本地化前缀
          cancellable: true,
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            cancellationTokenSource.cancel(); // 标记任务已取消
            vscode.window.showWarningMessage(
              localize("ftp.provider.downloadCancelled")
            );
          });

          try {
            if (item.isDirectory) {
              await this.ftpClient.downloadDirectory(
                sourcePath,
                targetDir,
                progress,
                cancellationTokenSource.token
              );
            } else {
              await this.ftpClient.downloadFile(
                sourcePath,
                targetDir,
                progress,
                cancellationTokenSource.token
              );
            }
            if (!token.isCancellationRequested) {
              vscode.window.showInformationMessage(
                localize("ftp.provider.downloadSuccess", item.label, targetDir)
              ); // 更新本地化前缀
            }
          } catch (error) {
            if (!token.isCancellationRequested) {
              vscode.window.showErrorMessage(
                localize("ftp.provider.downloadFailed", error.message)
              ); // 更新本地化前缀
            }
          } finally {
            cancellationTokenSource.dispose(); // 清理资源
          }
        }
      );
    }
  }

  public async setRootDirectory(item: FtpItem) {
    this.currentRootPath = item.path;
    const config = vscode.workspace.getConfiguration("ftpClient");
    await config.update(
      "4.path",
      this.currentRootPath,
      vscode.ConfigurationTarget.Global
    );
    await this.refreshFTPItems(this.currentRootPath);
  }

  async refreshFTPItems(path: string = "/"): Promise<void> {
    vscode.commands.executeCommand(
      "setContext",
      "ftpExplorer.refreshEnabled",
      false
    );
    this.currentPath = path;
    this.currentRootPath = path;
    await this.loadFTPItems(this.currentPath);
    this.refresh();
    const currentTime = new Date().toLocaleTimeString(); // 获取当前时间到秒
    vscode.window.setStatusBarMessage(
      localize("ftp.provider.refreshSuccess") + ` (${currentTime})`
    );
    vscode.commands.executeCommand(
      "setContext",
      "ftpExplorer.refreshEnabled",
      true
    );
  }

  private async safeExecute(task: () => Promise<void>): Promise<void> {
    // if (this.isBusy) {
    //   vscode.window.showErrorMessage(localize("ftp.provider.waitForTask")); // 更新本地化前缀
    //   return;
    // }
    this.isBusy = true;
    try {
      await task();
    } catch (error) {
      vscode.window.showErrorMessage(
        localize("ftp.provider.ftpError", error.message)
      ); // 更新本地化前缀
    } finally {
      this.isBusy = false;
    }
  }

  private getFileModifiedDateStr(rawDate: string): string {
    // 解析 rawModifiedAt 的自定义函数
    const parseRawModifiedAt = (rawDate: string): Date | null => {
      const regex = /^(\d{2})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(AM|PM)$/;
      const match = rawDate.match(regex);

      if (!match) return null;

      const [, month, day, year, hour, minute, period] = match;

      // 年份解析，确保是完整的四位年份
      const fullYear =
        parseInt(year, 10) + (parseInt(year, 10) < 50 ? 2000 : 1900);

      // 小时转换为 24 小时制
      let hours = parseInt(hour, 10);
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;

      return new Date(
        fullYear,
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        hours,
        parseInt(minute, 10)
      );
    };

    const formatDate = (date: Date): string => {
      const pad = (num: number) => num.toString().padStart(2, "0");
      return ` \u21BB${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
        date.getSeconds()
      )} `;
    };

    const isToday = (date: Date): boolean => {
      const today = new Date();
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    };

    const parsedDate = rawDate ? parseRawModifiedAt(rawDate) : null;
    // 检查日期是否有效且为今天
    if (parsedDate && isToday(parsedDate)) {
      return formatDate(parsedDate);
    }

    return ""; // 如果日期无效或不是今天，返回空字符串
  }

  private async loadFTPItems(
    path: string = "/",
    showToParent: boolean = false,
    showInfo: boolean = false
  ): Promise<FtpItem[]> {
    if (typeof path !== "string") {
      vscode.window.showErrorMessage(
        localize("ftp.provider.invalidPath", typeof path)
      ); // 更新本地化前缀
      return [];
    }
    try {
      const items: FtpItem[] = [];
      const files = await this.ftpClient.list(path);
      if (showInfo) {
        items.push(
          new FtpItem(
            `${this.ftpClient.getHost()} - ${path}`,
            "/",
            this.getPathParentPath(path),
            false
          )
        );
      }
      if (showToParent) {
        items.push(
          new FtpItem(
            localize("ftp.provider.toParentDirectory"), // 更新本地化前缀
            "../",
            this.getPathParentPath(path),
            false
          )
        );
      }
      items.push(
        ...files.map((file) => {
          return new FtpItem(
            file.name,
            path === "/" ? `/${file.name}` : `${path}/${file.name}`,
            path,
            file.isDirectory,
            this.getFileModifiedDateStr(file.rawModifiedAt)
          );
        })
      );

      return items;
    } catch (error) {
      vscode.window.showErrorMessage(
        localize("ftp.provider.loadItemsFailed", error.message)
      ); // 更新本地化前缀
      return [];
    }
  }

  private getPathParentPath(path: string): string {
    if (path === "/" || path === "") {
      return "/";
    }

    if (path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    const lastSlashIndex = path.lastIndexOf("/");

    if (lastSlashIndex === -1) {
      return "/";
    }

    const parentPath = path.substring(0, lastSlashIndex);
    return parentPath === "" ? "/" : parentPath;
  }

  public async deleteFTPItem(item: FtpItem): Promise<void> {
    const confirmDelete = await vscode.window.showWarningMessage(
      localize("ftp.provider.confirmDelete", item.label),
      localize("ftp.provider.yes"),
      localize("ftp.provider.no")
    ); // 更新本地化前缀

    if (confirmDelete !== localize("ftp.provider.yes", "Yes")) return;

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: localize("ftp.provider.deleting", item.label),
        cancellable: false,
      },
      async (progress) => {
        try {
          if (item.isDirectory) {
            await this.ftpClient.removeDirectory(item.path);
          } else {
            await this.ftpClient.removeFile(item.path);
          }
          progress.report({ increment: 100 });
          vscode.window.showInformationMessage(
            localize("ftp.provider.deleteSuccess", item.label)
          ); // 更新本地化前缀
          await this.refreshFTPItems(this.currentPath);
        } catch (error) {
          vscode.window.showErrorMessage(
            localize(
              "ftp.provider.deleteFailed",
              "Failed to delete {0}: {1}",
              item.label,
              error.message
            )
          ); // 更新本地化前缀
        }
      }
    );
  }

  private getDefaultUri(workspaceFolder) {
    const config = vscode.workspace.getConfiguration("ftpClient.8");
    const defaultUriConfig = config.get<string>("defaultUri");
    let defaultUri: vscode.Uri | undefined;
    if (defaultUriConfig) {
      try {
        const parsedUri = vscode.Uri.file(defaultUriConfig);
        const fs = require("fs");
        if (fs.existsSync(parsedUri.fsPath)) {
          defaultUri = parsedUri;
        } else {
          vscode.window.showErrorMessage(
            localize("ftp.provider.invalidDefaultUri", defaultUriConfig)
          );
          defaultUri = workspaceFolder
            ? vscode.Uri.file(workspaceFolder)
            : undefined;
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          localize("ftp.provider.invalidDefaultUriFormat", defaultUriConfig)
        );
        defaultUri = workspaceFolder
          ? vscode.Uri.file(workspaceFolder)
          : undefined;
      }
    } else {
      defaultUri = workspaceFolder
        ? vscode.Uri.file(workspaceFolder)
        : undefined;
    }
    return defaultUri;
  }

  public async uploadToFTP() {
    const workspaceFolder = vscode.workspace.workspaceFolders
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        localize("ftp.provider.noWorkspaceFolder", "No workspace folder found.")
      );
      return;
    }

    const workspaceFolderName = path.basename(workspaceFolder); // 获取当前工作目录名称
    const uploadCurrentWorkspaceAction = localize(
      "ftp.provider.uploadCurrentWorkspace",
      workspaceFolderName
    );
    const actions = [
      uploadCurrentWorkspaceAction,
      localize("ftp.provider.uploadFolder"),
      localize("ftp.provider.uploadFile"),
    ];

    const action = await vscode.window.showQuickPick(actions, {
      placeHolder: localize("ftp.provider.chooseUploadAction"),
    });

    if (!action) {
      return;
    }
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    const isUploadingWorkspace = action === uploadCurrentWorkspaceAction;
    let defaultUri: vscode.Uri | undefined;
    defaultUri = this.getDefaultUri(workspaceFolder);

    const config = vscode.workspace.getConfiguration("ftpClient.9");
    const confirmTheUploadDirectory = config.get<boolean>(
      "confirmTheUploadDirectory"
    );

    const selectedFiles = isUploadingWorkspace
      ? [{ fsPath: workspaceFolder }]
      : await vscode.window.showOpenDialog({
        canSelectFolders: action === localize("ftp.provider.uploadFolder"),
        canSelectFiles: action === localize("ftp.provider.uploadFile"),
        canSelectMany: true,
        openLabel: action,
        defaultUri: defaultUri,
      });

    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    let remotePath = this.currentRootPath;
    if (isUploadingWorkspace) {
      const workspaceFolderName = path.basename(workspaceFolder);
      remotePath = path.posix.join(
        this.currentRootPath || "",
        workspaceFolderName
      );
    } else if (selectedFiles.length === 1) {
      const selectedFolderName = path.basename(selectedFiles[0].fsPath);
      remotePath = path.posix.join(
        this.currentRootPath || "",
        selectedFolderName
      );
    }

    if (confirmTheUploadDirectory) {
      remotePath = await vscode.window.showInputBox({
        prompt: localize("ftp.provider.enterDestinationPath"),
        value: remotePath,
        placeHolder: localize("ftp.provider.examplePath"),
      });
    }
    if (!remotePath) {
      return;
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: localize("ftp.provider.uploading"),
        cancellable: true,
      },
      async (progress, token) => {
        try {
          token.onCancellationRequested(() => {
            cancellationTokenSource.cancel();
            vscode.window.showWarningMessage(
              localize("ftp.provider.uploadCancelled", "Upload cancelled.")
            );
          });

          for (const [index, file] of selectedFiles.entries()) {
            if (token.isCancellationRequested) {
              break; // 取消任务
            }
            const localPath = file.fsPath;
            const fileName = path.basename(localPath);
            const isDirectory =
              isUploadingWorkspace ||
              (await vscode.workspace.fs.stat(vscode.Uri.file(file.fsPath)))
                .type === vscode.FileType.Directory;

            if (isDirectory) {
              await this.uploadDirectoryWithStructure(
                localPath,
                remotePath,
                progress,
                token
              );
            } else {
              // const remoteTargetPath = path.posix.join(remotePath, fileName);
              if (token.isCancellationRequested) {
                break; // 检查取消状态
              }
              await this.ftpClient.uploadFile(
                localPath,
                remotePath,
                progress,
                token
              );
            }
          }

          if (!token.isCancellationRequested) {
            vscode.window.showInformationMessage(
              localize(
                "ftp.provider.uploadSuccess",
                isUploadingWorkspace
                  ? workspaceFolder
                  : path.basename(selectedFiles[0]?.fsPath),
                remotePath
              )
            );
            await this.refreshFTPItems(this.currentPath);
            const config = vscode.workspace.getConfiguration("ftpClient.m10");
            const previewAfterUploading = config.get<boolean>(
              "previewAfterUploading"
            );
            if (previewAfterUploading) {
              const browserOpener = new BrowserOpener();
              browserOpener.openUrlInBrowser({ path: remotePath });
            }
          }
        } catch (error) {
          if (!token.isCancellationRequested) {
            vscode.window.showErrorMessage(
              localize("ftp.provider.uploadFailed", error.message)
            );
          }
        } finally {
          cancellationTokenSource.dispose();
        }
      }
    );
  }

  private async uploadDirectoryWithStructure(
    localPath: string,
    remotePath: string,
    progress: vscode.Progress<{ increment?: number }>,
    token: vscode.CancellationToken
  ) {
    const fs = require("fs").promises;
    const path = require("path");

    // 获取忽略规则
    const config = vscode.workspace.getConfiguration("ftpClient");
    const ignorePatternStr = config.get<string>(
      "7.ignore",
      ".*\\.(zip|rar)$|\\.vscode$|node_modules"
    );
    const ignorePattern = new RegExp(ignorePatternStr);

    // 检查文件是否匹配忽略规则
    const isIgnored = (filePath: string) => ignorePattern.test(filePath);

    await this.ftpClient.createDirectory(remotePath);

    const items = await fs.readdir(localPath, { withFileTypes: true });

    for (const item of items) {
      const itemLocalPath = path.join(localPath, item.name);
      const itemRemotePath = path.posix.join(remotePath, item.name);
      // 检查是否需要忽略
      if (isIgnored(itemLocalPath)) {
        console.log("忽略的文件", itemLocalPath);
        continue;
      }
      if (item.isDirectory()) {
        await this.uploadDirectoryWithStructure(
          itemLocalPath,
          itemRemotePath,
          progress,
          token
        );
      } else {
        await this.ftpClient.uploadFile(
          itemLocalPath,
          itemRemotePath,
          progress,
          token
        );
      }
    }
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FtpItem): vscode.TreeItem {
    return element;
  }

  async backParentDirectory(item: FtpItem) {
    const parentPath = item.parentPath;
    await this.refreshFTPItems(parentPath);
    item.path = parentPath;
    this.setRootDirectory(item);
  }

  async getChildren(element?: FtpItem): Promise<FtpItem[]> {
    if (!element) {
      let showToParent = this.currentPath === "/" ? false : true;
      return this.loadFTPItems(this.currentPath, showToParent, true); // 根目录
    } else if (element.isDirectory) {
      return this.loadFTPItems(element.path); // 获取子目录
    }
    return [];
  }
}

export class FtpItem extends vscode.TreeItem {
  constructor(
    public label: string,
    public path: string,
    public parentPath: string,
    public isDirectory: boolean,
    public modifiedDateStr?: string
  ) {
    super(
      label,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.description = modifiedDateStr ? modifiedDateStr : "";
    if (path === "/") {
      this.command = {
        command: "ftpExplorer.setRootDirectory", // 添加一个统一的命令
        title: localize("ftpExplorer.setRootDirectory"),
        arguments: [this],
      };
      this.contextValue = "special";
      return;
    } else if (path === "../" && parentPath) {
      this.command = {
        command: "ftpExplorer.backParentDirectory",
        title: localize("ftpExplorer.backParentDirectory"),
        arguments: [this],
      };
      this.contextValue = "special";
      return;
    } else {
      this.command = isDirectory
        ? {
          command: "ftpExplorer.setRootDirectory", // 添加一个统一的命令
          title: localize("ftpExplorer.setRootDirectory"),
          arguments: [this],
        }
        : {
          command: "ftpExplorer.openFile",
          title: localize("ftpExplorer.openFile"),
          arguments: [this.path],
        };
      this.contextValue = isDirectory ? "folder" : "file";
    }
  }
}
