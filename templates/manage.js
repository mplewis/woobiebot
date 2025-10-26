const AUTH_DATA = {
  userId: {{USER_ID}},
  token: {{TOKEN}},
  signature: {{SIGNATURE}},
  expiresAt: {{EXPIRES_AT}},
};

const DIRECTORY_TREE = {{DIRECTORY_TREE}};

function renderDirectoryTree(tree, container, level = 0) {
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

      summary.appendChild(icon);
      summary.appendChild(folderName);
      details.appendChild(summary);

      const childContainer = document.createElement('div');
      renderDirectoryTree(value, childContainer, level + 1);
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
