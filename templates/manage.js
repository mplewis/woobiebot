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

  for (const [key, value] of Object.entries(tree)) {
    if (key === '_files') {
      for (const file of value) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'tree-file';
        fileDiv.style.paddingLeft = `${level * 20}px`;
        fileDiv.textContent = file.name;
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

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('upload-form');
  form.addEventListener('submit', handleUpload);

  const fileTreeContainer = document.getElementById('file-tree');
  renderDirectoryTree(DIRECTORY_TREE, fileTreeContainer);
});
