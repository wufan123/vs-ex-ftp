import * as vscode from "vscode";
import { FtpItem, FtpTreeProvider } from "./FtpTreeProvider";
import { FileHandler } from "./FileHandler";
const { localize, init } = require("vscode-nls-i18n");
import { BrowserOpener } from "./BrowserOpener";
import RecentFilesTreeDataProvider from "./RecentFilesTreeDataProvider";
import { compressDirectoryWithIgnore, compressSelectedItems } from "./CompressHelper";
function activate(context: vscode.ExtensionContext) {

  init(context.extensionPath);
  // *******
  // 注册最近修改视图
  const recentTreeDataProvider = new RecentFilesTreeDataProvider();
  const recentTreeView = vscode.window.createTreeView('recent-files', {
    treeDataProvider: recentTreeDataProvider,
    canSelectMany: true // 启用多选功能
  });
  // 监听文件系统更改事件
  const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  fileSystemWatcher.onDidChange(() => recentTreeDataProvider.throttledRefresh());
  fileSystemWatcher.onDidCreate(() => recentTreeDataProvider.throttledRefresh());
  fileSystemWatcher.onDidDelete(() => recentTreeDataProvider.throttledRefresh());

  const disposableRefresh = vscode.commands.registerCommand('vs-ex-compress.refreshRecentFiles', () => {
    recentTreeDataProvider.refresh();
  });

  const disposableCompress = vscode.commands.registerCommand('vs-ex-compress.compressDirectory', async () => {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showErrorMessage('No workspace is open.');
      return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    await compressDirectoryWithIgnore(workspaceRoot);
  });

  // 在 activate 函数中注册新命令
  const disposableCompressSelected = vscode.commands.registerCommand('vs-ex-compress.compressSelectedItems', async (item) => {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showErrorMessage('No workspace is open.');
      return;
    }

    // 获取当前选中的 TreeItem
    let selectedItems = [...recentTreeView.selection]; // 将 readonly Uri[] 转换为普通数组
    if (selectedItems.length <= 0) {
      selectedItems = [item];
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    await compressSelectedItems(selectedItems, workspaceRoot);
  });

  const disposableOpenSettings = vscode.commands.registerCommand('vs-ex-compress.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'compress');
  });
  context.subscriptions.push(disposableOpenSettings);

  context.subscriptions.push(disposableRefresh);
  context.subscriptions.push(disposableCompress);
  context.subscriptions.push(disposableCompressSelected);
  context.subscriptions.push(recentTreeView);
  context.subscriptions.push(fileSystemWatcher);

  // 注册ftp视图
  const ftpTreeProvider = new FtpTreeProvider();
  const treeView = vscode.window.createTreeView("ftp-explorer", {
    treeDataProvider: ftpTreeProvider,
    canSelectMany: true, // 启用多选功能
  });
  ftpTreeProvider.refresh();
  //注册打开设置
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.openSettings", () => {
      // 打开设置页面
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "ftpClient"
      );
    })
  );
  //连接服务器
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.connectFTP", async () => {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    })
  );
  // 注册刷新命令
  const refreshCommand = vscode.commands.registerCommand(
    "ftpExplorer.refresh",
    async () => {
      await ftpTreeProvider.refreshFTPItems(
        ftpTreeProvider.getCurrentRootPath()
      );
    }
  );
  context.subscriptions.push(refreshCommand);

  //注册下载文件命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ftpExplorer.downloadToDirectory",
      (item: FtpItem) => {
        let selectedItems = [...treeView.selection];
        selectedItems = selectedItems.filter(
          (selectedItem) => selectedItem.contextValue != "special"
        );
        if (selectedItems.length <= 0) {
          selectedItems = [item];
        }
        ftpTreeProvider.downloadToDirectory(selectedItems);
      }
    )
  );
  //注册删除文件命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ftpExplorer.deleteItem",
      async (item: FtpItem) => {
        let selectedItems = [...treeView.selection];
        selectedItems = selectedItems.filter(
          (selectedItem) => selectedItem.contextValue != "special"
        );
        if (selectedItems.length <= 0) {
          selectedItems = [item];
        }
        await ftpTreeProvider.deleteFTPItems(selectedItems);
      }
    )
  );
  // 注册上传命令
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.uploadItem", async (item: vscode.Uri | vscode.Uri[]) => {
      await ftpTreeProvider.uploadToFTP(item);
    })
  );
  // 注册上传最近文件命令
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.uploadRecentItem", async (item) => {
      let selectedItems = [...recentTreeView.selection]; // 将 readonly Uri[] 转换为普通数组
      if (selectedItems.length <= 0) {
        selectedItems = [item];
      }
      await ftpTreeProvider.uploadToFTP(selectedItems, true);
    })
  );
  // 注册上传所有今日修改文件
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.uploadTodayModifyItem", async (item: vscode.Uri | vscode.Uri[]) => {
      let modifyItems = recentTreeDataProvider.getTodayModifyItem();
      if (modifyItems.length) {
        await ftpTreeProvider.uploadToFTP(modifyItems, true);
      } else {
        vscode.window.showWarningMessage(localize("ftpExplorer.noTodayModifyItem")); 
      }
    })
  );
  // 注册回到上一级命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ftpExplorer.backParentDirectory",
      (item: FtpItem) => {
        ftpTreeProvider.backParentDirectory(item);
      }
    )
  );

  // 注册设置当前路径为一级目录的命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ftpExplorer.setRootDirectory",
      async (item: FtpItem) => {
        await ftpTreeProvider.setRootDirectory(item); // 调用设置方法
      }
    )
  );

  // 注册重命名文件/文件夹命令
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.renameItem", async (item: FtpItem) => {
      await ftpTreeProvider.renameFTPItem(item);
    })
  );

  // 注册文件打开命令
  const fileHandler = new FileHandler();
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ftpExplorer.openFile",
      async (filePath: string) => {
        const choice = await vscode.window.showQuickPick([
          localize("ftp.provider.yes"),
          localize("ftp.provider.no")
        ], {
          placeHolder: localize("ftp.provider.openFilePrompt"),
        });
        if (choice === localize("ftp.provider.yes")) {
          const tempFilePath = await ftpTreeProvider.ftpClient.downloadToTempFile(
            filePath
          );
          try {
            await fileHandler.openFile(tempFilePath);
          } catch (e) {
          }
        }
      }
    )
  );
  //注册预览命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ftpExplorer.previewHtml",
      async (item: vscode.Uri) => {
        const browserOpener = new BrowserOpener();
        await browserOpener.openUrlInBrowser(item);
      }
    )
  );
  //注册预览当前目录命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ftpExplorer.previewWorkspace",
      async (item: vscode.Uri) => {
        ftpTreeProvider.previewWorkspace();
      }
    )
  );

  // 注册新建文件夹命令
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.createFolder", async (item: FtpItem) => {
      await ftpTreeProvider.createFolder();
    })
  );

  // 在 activate 函数中注册搜索命令
  context.subscriptions.push(
    vscode.commands.registerCommand("ftpExplorer.searchItems", async () => {
      const keyword = await vscode.window.showInputBox({
        prompt: localize("ftp.provider.enterSearchKeyword"),
        placeHolder: localize("ftp.provider.searchPlaceholder", ftpTreeProvider.getCurrentRootPath()),
      });

      if (!keyword) {
        return; // 用户取消操作
      }
      const searchResults = await ftpTreeProvider.searchItems(keyword);

      if (searchResults.length > 0) {
        vscode.window.showQuickPick(
          searchResults.map(item => item.label),
          { placeHolder: localize("ftp.provider.selectSearchResult") }
        ).then(selected => {
          if (selected) {
            const selectedItem = searchResults.find(item => item.label === selected);
            if (selectedItem) {
              if (selectedItem.isDirectory) {
                console.log("Selected directory:", selectedItem.path);
                vscode.commands.executeCommand("ftpExplorer.setRootDirectory", selectedItem);
              } else {
                vscode.commands.executeCommand("ftpExplorer.openFile", selectedItem.path);
              }
            }
          }
        });
      }
    })
  );
}

function deactivate() { }

module.exports = {
  activate,
  deactivate,
};
