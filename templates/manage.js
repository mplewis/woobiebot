const AUTH_DATA = {
  userId: {{USER_ID}},
  token: {{TOKEN}},
  signature: {{SIGNATURE}},
  expiresAt: {{EXPIRES_AT}},
};

const DIRECTORY_TREE = {{DIRECTORY_TREE}};

function buildDirectoryPath(tree, targetKey, currentPath = []) {
  for (const [key, value] of Object.entries(tree)) {
    if (key === '_files') continue;

    if (key === targetKey) {
      return [...currentPath, key].join('/');
    }

    const result = buildDirectoryPath(value, targetKey, [...currentPath, key]);
    if (result) return result;
  }
  return null;
}

function openUploadBox(directoryPath) {
  const directoryInput = document.getElementById('directory');

  directoryInput.value = directoryPath;

  const uploadSection = document.getElementById('upload-section');
  uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  setTimeout(() => {
    directoryInput.focus();
  }, 500);
}

function renderDirectoryTree(tree, container, level = 0, parentPath = []) {
  if (!tree || Object.keys(tree).length === 0) {
    container.innerHTML = '<div class="tree-empty">No files indexed yet</div>';
    return;
  }

  const entries = Object.entries(tree);
  const fileEntry = entries.find(([key]) => key === '_files');
  const dirEntries = entries.filter(([key]) => key !== '_files').sort(([a], [b]) => a.localeCompare(b));

  for (const [key, value] of dirEntries) {
    const details = document.createElement('details');
    details.open = level === 0;
    details.style.paddingLeft = `${level * 20}px`;

    const summary = document.createElement('summary');
    summary.className = 'tree-dir';

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = '▶';

    const folderName = document.createElement('span');
    folderName.className = 'tree-dir-name';
    folderName.textContent = key;

    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'tree-upload-btn';
    uploadBtn.textContent = '↑';
    uploadBtn.title = 'Upload to this folder';
    uploadBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fullPath = [...parentPath, key].join('/');
      openUploadBox(fullPath);
    };

    summary.appendChild(icon);
    summary.appendChild(folderName);
    summary.appendChild(uploadBtn);

    details.appendChild(summary);

    const subContainer = document.createElement('div');
    renderDirectoryTree(value, subContainer, level + 1, [...parentPath, key]);
    details.appendChild(subContainer);

    container.appendChild(details);
  }

  if (fileEntry) {
    const [, files] = fileEntry;
    const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));

    for (const file of sortedFiles) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'tree-file';
        fileDiv.style.paddingLeft = `${level * 20}px`;

        const downloadUrl = `/manage/download/${file.id}?userId=${AUTH_DATA.userId}&signature=${AUTH_DATA.signature}&expiresAt=${AUTH_DATA.expiresAt}`;

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.textContent = file.name;
        link.className = 'tree-file-link';
        link.download = file.name;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tree-file-delete';
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete file';
        deleteBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          showDeleteModal(file.id, file.name);
        };

        fileDiv.appendChild(link);
        fileDiv.appendChild(deleteBtn);
        container.appendChild(fileDiv);
      }
    } else {
      const details = document.createElement('details');
      details.open = level === 0;
      details.style.paddingLeft = `${level * 20}px`;

      const summary = document.createElement('summary');
      summary.className = 'tree-dir';

      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.textContent = '▶';

      const folderName = document.createElement('span');
      folderName.className = 'tree-dir-name';
      folderName.textContent = key;

      const uploadBtn = document.createElement('button');
      uploadBtn.className = 'tree-upload-btn';
      uploadBtn.textContent = '↑';
      uploadBtn.title = 'Upload to this folder';
      uploadBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fullPath = [...parentPath, key].join('/');
        openUploadBox(fullPath);
      };

      summary.appendChild(icon);
      summary.appendChild(folderName);
      summary.appendChild(uploadBtn);
      details.appendChild(summary);

      const childContainer = document.createElement('div');
      renderDirectoryTree(value, childContainer, level + 1, [...parentPath, key]);
      details.appendChild(childContainer);

      container.appendChild(details);
    }
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
}

async function handleUpload(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const uploadBtn = document.getElementById('upload-btn');

  formData.append('userId', AUTH_DATA.userId);
  formData.append('token', AUTH_DATA.token);
  formData.append('signature', AUTH_DATA.signature);
  formData.append('expiresAt', AUTH_DATA.expiresAt);

  uploadBtn.disabled = true;
  showStatus('Uploading file...', 'info');

  try {
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      showStatus('File uploaded successfully! Refreshing file list...', 'success');
      form.reset();

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showStatus(`Upload failed: ${result.error || 'Unknown error'}`, 'error');
      uploadBtn.disabled = false;
    }
  } catch (error) {
    showStatus(`Upload failed: ${error.message}`, 'error');
    uploadBtn.disabled = false;
  }
}

let currentDeleteFileId = null;
let currentDeleteFileName = null;

function showDeleteModal(fileId, fileName) {
  currentDeleteFileId = fileId;
  currentDeleteFileName = fileName;

  const modal = document.getElementById('delete-modal');
  const filenameSpan = document.getElementById('delete-filename');
  const confirmInput = document.getElementById('delete-confirm-input');
  const confirmBtn = document.getElementById('delete-confirm-btn');

  filenameSpan.textContent = fileName;
  confirmInput.value = '';
  confirmInput.placeholder = fileName;
  confirmBtn.disabled = true;

  modal.classList.add('show');
  setTimeout(() => confirmInput.focus(), 100);
}

function hideDeleteModal() {
  const modal = document.getElementById('delete-modal');
  modal.classList.remove('show');
  currentDeleteFileId = null;
  currentDeleteFileName = null;
}

async function handleDeleteFile() {
  if (!currentDeleteFileId) return;

  const confirmBtn = document.getElementById('delete-confirm-btn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting...';

  try {
    const deleteUrl = `/manage/delete/${currentDeleteFileId}?userId=${AUTH_DATA.userId}&signature=${AUTH_DATA.signature}&expiresAt=${AUTH_DATA.expiresAt}`;
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
    });

    const result = await response.json();

    if (response.ok) {
      hideDeleteModal();
      showStatus('File deleted successfully! Refreshing file list...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showStatus(`Delete failed: ${result.error || 'Unknown error'}`, 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete File';
    }
  } catch (error) {
    showStatus(`Delete failed: ${error.message}`, 'error');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete File';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('upload-form');
  form.addEventListener('submit', handleUpload);

  const fileTreeContainer = document.getElementById('file-tree');
  renderDirectoryTree(DIRECTORY_TREE, fileTreeContainer);

  const deleteConfirmInput = document.getElementById('delete-confirm-input');
  const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  const deleteCancelBtn = document.getElementById('delete-cancel-btn');

  deleteConfirmInput.addEventListener('input', (e) => {
    deleteConfirmBtn.disabled = e.target.value !== currentDeleteFileName;
  });

  deleteConfirmBtn.addEventListener('click', handleDeleteFile);
  deleteCancelBtn.addEventListener('click', hideDeleteModal);

  const deleteModal = document.getElementById('delete-modal');
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
      hideDeleteModal();
    }
  });
});
