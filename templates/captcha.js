const challenge = {{CHALLENGE}};
const token = {{TOKEN}};
const signature = {{SIGNATURE}};
const userId = {{USER_ID}};
const fileId = {{FILE_ID}};

const statusDiv = document.getElementById('status');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

function setStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  statusDiv.style.display = 'block';
}

function setProgress(current, total) {
  const percent = Math.round((current / total) * 100);
  progressBar.style.width = percent + '%';
  progressContainer.style.display = 'block';
}

function hideProgress() {
  progressContainer.style.display = 'none';
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

function prng(seed, length) {
  function fnv1a(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0;
  }

  let state = fnv1a(seed);
  let result = '';

  function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  }

  while (result.length < length) {
    const rnd = next();
    result += rnd.toString(16).padStart(8, '0');
  }

  return result.substring(0, length);
}

async function solveChallenge(salt, target) {
  for (let nonce = 0; nonce < 10000000; nonce++) {
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + nonce.toString());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash.startsWith(target)) {
      return nonce;
    }
  }
  throw new Error(`Failed to solve challenge with target ${target}`);
}

async function solveCaptcha(token, challenge) {
  const solutions = [];
  setProgress(0, challenge.c);
  for (let i = 1; i <= challenge.c; i++) {
    const salt = prng(`${token}${i}`, challenge.s);
    const target = prng(`${token}${i}d`, challenge.d);
    const solution = await solveChallenge(salt, target);
    solutions.push(solution);
    setProgress(i, challenge.c);
  }
  return solutions;
}

async function submitSolution(solution) {
  try {
    hideProgress();
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
      throw new Error(error.error || 'Sorry, something went wrong');
    }

    setStatus('Verification successful! Downloading...', 'success');

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'download';
    if (contentDisposition) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
      if (matches?.[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    }

    const blob = await response.blob();
    downloadBlob(blob, filename);
    setStatus('Download complete! You can close this window.', 'success');
  } catch (error) {
    console.error('Verification error:', error);
    setStatus('Verification failed: ' + error.message, 'error');
    hideProgress();
  }
}

(async () => {
  try {
    setStatus('Solving challenge...', 'info');
    const solutions = await solveCaptcha(token, challenge);

    setStatus('Challenge solved! Verifying...', 'info');
    await submitSolution(solutions);
  } catch (error) {
    console.error('Failed to solve captcha challenge:', error);
    setStatus('Failed to solve challenge: ' + error.message, 'error');
  }
})();
