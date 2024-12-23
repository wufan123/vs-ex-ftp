# FTP Explorer VS Code Extension

## Introduction
The FTP Explorer extension for Visual Studio Code allows developers to seamlessly interact with remote FTP servers. You can browse remote directories, upload and download files and folders, delete files, and refresh FTP items directly within the VS Code interface. This extension streamlines FTP operations for developers who need to manage remote servers while coding locally.

---

## Initial Configuration
Before using the extension, you need to configure it with the necessary FTP details. Below is the list of configuration parameters:

### Configuration Parameters

1. **ftpClient.host** (string):
   - Description: The hostname or IP address of the FTP server.
   - Example: `"ftp.example.com"`

2. **ftpClient.user** (string):
   - Description: The username for FTP authentication.
   - Example: `"username"`

3. **ftpClient.password** (string):
   - Description: The password for FTP authentication.
   - Example: `"password"`

4. **ftpClient.secure** (boolean):
   - Description: Use secure FTP (FTPS).
   - Default: `false`

5. **ftpClient.path** (string):
   - Description: The default path to connect to on the remote FTP server.
   - Default: `"/"`

6. **ftpClient.baseUrl** (string):
   - Description: The base URL for previewing `.html` files in a browser.
   - Default: `"http://192.168.63.174"`

7. **ftpClient.ignore** (string):
   - Description: A regular expression to ignore files or directories during uploads.
   - Default: `"\.zip|\.rar|\.vscode|node_modules"`

---

## Features and Usage

### 1. **Browse FTP Directory**
   - **Description**: View the remote directory structure directly in the VS Code sidebar.
   - **Steps**:
     1. Open the "FTP Explorer" view in the VS Code sidebar.
     2. The remote directory structure will automatically load based on your configuration.
     3. Click on directories to navigate.

### 2. **Upload Files and Folders**
   - **Description**: Upload local files and directories to the remote server.
   - **Steps**:
     1. Right-click in the "FTP Explorer" view or use the command palette (`Ctrl+Shift+P`) to select `FTP Explorer: Upload Files` or `FTP Explorer: Upload Folder`.
     2. Select the local files or folders you wish to upload.
     3. Confirm the destination path or use the default provided.
     4. Progress will be displayed in the notification area.

### 3. **Download Files and Folders**
   - **Description**: Download remote files or directories to your local workspace.
   - **Steps**:
     1. Right-click a file or folder in the "FTP Explorer" view and select `Download`.
     2. Choose a local destination folder for the download.
     3. The file or folder will be downloaded, and progress will be shown in the notification area.

### 4. **Delete Files and Directories**
   - **Description**: Remove files or directories from the remote server.
   - **Steps**:
     1. Right-click a file or folder in the "FTP Explorer" view.
     2. Select `Delete`.
     3. Confirm the deletion action.
     4. The file or directory will be removed from the remote server.

### 5. **Refresh FTP Items**
   - **Description**: Refresh the remote directory structure to reflect the latest state of the server.
   - **Steps**:
     1. Right-click in the "FTP Explorer" view.
     2. Select `Refresh`.
     3. The view will reload and display the updated directory structure.

### 6. **Set Current Root Directory**
   - **Description**: Change the root directory to a specific folder on the remote server.
   - **Steps**:
     1. Right-click a directory in the "FTP Explorer" view.
     2. Select `Set as Root Directory`.
     3. The selected directory will become the new root, and the view will update accordingly.

---

## Additional Commands

- **Preview HTML in Browser**:
  - Right-click on a `.html` file in the "FTP Explorer" view and select `Preview in Browser`.
  - The file will open in your default browser using the configured `ftpClient.baseUrl`.

---

## FAQ

1. **Why can’t I connect to my FTP server?**
   - Check your `ftpClient.host`, `ftpClient.user`, and `ftpClient.password` configurations.
   - Ensure the server is reachable and your credentials are correct.

2. **How do I ignore specific files during upload?**
   - Use the `ftpClient.ignore` configuration to define a regular expression for files and directories to exclude from uploads.

3. **How do I update my FTP settings?**
   - Open the VS Code settings (`Ctrl+,`), search for `ftpClient`, and update the required fields.

---

## License
This extension is licensed under the [MIT License](LICENSE.md).

