# FTP Plus Toolbox (English)

**FTP Plus Toolbox** is a powerful VS Code extension that integrates FTP file management, compression, fast upload/download, and more, helping you efficiently manage both local and remote files.

---

## Features

- **FTP File Management**
  - Browse, upload, download, delete, and rename remote FTP files and folders
  - Support multi-selection and batch operations
  - Set any directory as the root
  - Upload with directory structure
  - Auto-preview in browser after upload

- **Local File Compression**
  - One-click compression of the current workspace directory
  - Support ignore rules (e.g., node_modules, .git, etc.)
  - Batch compress recently modified files

- **Recent Files View**
  - Quickly view and operate on recently modified files
  - Batch compress and upload

- **Search & Preview**
  - Search files/folders in remote FTP directories
  - One-click browser preview for HTML files

---

## Getting Started

1. **Install Extension**  
   Search for `FTP Plus Toolbox` in the VS Code marketplace and install.

2. **Configure FTP Connection**  
   Fill in your FTP server info (host, user, password, baseUrl, etc.) in VS Code settings.

3. **Use FTP Explorer**  
   Click the **FTP Plus Toolbox** icon in the sidebar to browse and manage remote files.

4. **Local Compression & Upload**  
   - Right-click files/folders in the explorer or "Recent Files" view to compress or upload to FTP.
   - Supports multi-selection and batch operations.

---

## Common Commands

- `FTP: Connect`
- `FTP: Refresh`
- `FTP: Upload File/Folder`
- `FTP: Download`
- `FTP: Delete`
- `FTP: Rename`
- `FTP: Set as Root`
- `FTP: Search Current Directory`
- `FTP: Preview HTML`
- `Compress: Compress Current Directory`
- `Compress: Compress Selected Files`

---

## Settings

| Setting | Description |
| ------- | ----------- |
| `ftpClient.1.host` | FTP server address |
| `ftpClient.2.user` | Username |
| `ftpClient.3.password` | Password |
| `ftpClient.4.path` | Default remote path |
| `ftpClient.5.baseUrl` | Base URL for remote preview |
| `ftpClient.6.secure` | Enable FTPS |
| `ftpClient.7.ignore` | Ignore rules for upload/compress |
| `ftpClient.8.defaultUri` | Default local path |
| `ftpClient.9.confirmTheUploadDirectory` | Confirm target directory before upload |
| `ftpClient.m10.previewAfterUploading` | Auto preview after upload |

---

## Views

- **FTP Explorer**  
  Manage remote FTP files, supports right-click operations.
- **Recent Files**  
  Quickly access and batch operate on recently modified local files.

---

## FAQ

- **Upload fails with Chinese/special characters?**  
  Please ensure your FTP server supports such paths, or rename files/folders to English.
- **Multi-select upload/compress not working?**  
  Only supported in extension views (FTP Explorer, Recent Files). VS Code default explorer context menu only supports single selection.

---

## Open Source & Feedback

- [GitHub Repository](https://github.com/wufan123/vs-ex-ftp)
- Issues and PRs are welcome!