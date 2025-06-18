# FTP Plus Toolbox

**FTP Plus Toolbox** 是一款集 FTP 文件管理、压缩、快速上传/下载等多功能于一体的 VS Code 扩展，助你高效管理本地与远程文件。

---

## 主要功能

- **FTP 文件管理**
  - 浏览、上传、下载、删除、重命名远程 FTP 文件和文件夹
  - 支持多选批量操作
  - 支持设置任意目录为根目录
  - 支持目录结构上传
  - 上传后可自动浏览器预览

- **本地文件压缩**
  - 一键压缩当前工作区目录
  - 支持忽略规则（如 node_modules、.git 等）
  - 支持批量压缩最近修改的文件

- **最近文件视图**
  - 快速查看和操作最近修改的文件
  - 支持批量压缩、上传

- **搜索与预览**
  - 支持远程 FTP 目录下文件/文件夹搜索
  - 支持 HTML 文件一键浏览器预览

---

## 快速开始

1. **安装扩展**  
   在 VS Code 扩展市场搜索 `FTP Plus Toolbox` 并安装。

2. **配置 FTP 连接**  
   在 VS Code 设置中填写 FTP 服务器信息（host、user、password、baseUrl 等）。

3. **使用 FTP 资源管理器**  
   在侧边栏点击 **FTP Plus Toolbox** 图标，浏览和管理远程文件。

4. **本地压缩与上传**  
   - 在资源管理器或“最近文件”视图右键选择文件/文件夹，选择“压缩”或“上传到 FTP”。
   - 支持多选批量操作。

---

## 常用命令

- `FTP: 连接服务器`
- `FTP: 刷新`
- `FTP: 上传文件/文件夹`
- `FTP: 下载到本地`
- `FTP: 删除`
- `FTP: 重命名`
- `FTP: 设置为根目录`
- `FTP: 搜索当前目录`
- `FTP: 预览 HTML`
- `压缩：压缩当前目录`
- `压缩：压缩选中文件`

---

## 配置项

| 配置项 | 说明 |
| ------ | ---- |
| `ftpClient.1.host` | FTP 服务器地址 |
| `ftpClient.2.user` | 用户名 |
| `ftpClient.3.password` | 密码 |
| `ftpClient.4.path` | 默认远程路径 |
| `ftpClient.5.baseUrl` | 远程预览基础 URL |
| `ftpClient.6.secure` | 是否启用 FTPS |
| `ftpClient.7.ignore` | 上传/压缩时忽略规则 |
| `ftpClient.8.defaultUri` | 默认本地路径 |
| `ftpClient.9.confirmTheUploadDirectory` | 上传前是否确认目标目录 |
| `ftpClient.m10.previewAfterUploading` | 上传后自动预览 |

---

## 视图说明

- **FTP Explorer**  
  管理远程 FTP 文件，支持右键操作。
- **最近文件**  
  快速访问和批量操作最近修改的本地文件。

---

## 常见问题

- **中文/特殊字符上传失败？**  
  请确保 FTP 服务器支持中文路径，或将文件/目录名改为英文再试。
- **多选上传/压缩无效？**  
  仅支持在扩展自带的视图（如 FTP Explorer、最近文件）中多选，VS Code 默认资源管理器右键仅支持单选。

---

## 开源与反馈

- [GitHub 仓库](https://github.com/wufan123/vs-ex-ftp)
- 欢迎提 Issue 或 PR！