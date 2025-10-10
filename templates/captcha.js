import { mount } from 'https://cdn.jsdelivr.net/npm/@cap.js/widget@0.1.30/+esm';

const challenge = {{CHALLENGE}};
const signature = {{SIGNATURE}};
const userId = {{USER_ID}};
const fileId = {{FILE_ID}};

const statusDiv = document.getElementById('status');
const spinner = document.getElementById('spinner');

function setStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  statusDiv.style.display = 'block';

  if (type === 'info') {
    spinner.style.display = 'block';
  } else {
    spinner.style.display = 'none';
  }
}

async function submitSolution(solution) {
  try {
    setStatus('Verifying solution...', 'info');

    const response = await fetch('/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        fileId,
        challenge: JSON.stringify(challenge),
        signature,
        solution: solution.join(','),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Verification failed');
    }

    setStatus('Verification successful! Downloading...', 'success');

    // Trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    setTimeout(() => {
      setStatus('Download complete! You can close this window.', 'success');
    }, 1000);
  } catch (error) {
    console.error('Verification error:', error);
    setStatus('Verification failed: ' + error.message, 'error');
  }
}

// Mount the captcha widget
try {
  await mount('captcha-container', challenge, (solution) => {
    submitSolution(solution);
  });
} catch (error) {
  console.error('Failed to mount captcha widget:', error);
  setStatus('Failed to load captcha widget', 'error');
}
