import requests
import time
import hashlib
import os
import json
import csv

API_BASE_URL = 'https://192.168.0.105:3000/api'
DOWNLOAD_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(DOWNLOAD_DIR, 'config.json')
FIRMWARE_FILE = os.path.join(DOWNLOAD_DIR, 'firmware.bin')
CA_CERT = os.path.join(DOWNLOAD_DIR, 'ca_cert.pem')
OUTPUT_CSV = os.path.join(DOWNLOAD_DIR, 'update_times.csv')

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config_data = json.load(f)
        return config_data
    else:
        print('Configuration file config.json not found.')
        raise FileNotFoundError('Configuration file config.json not found.')

def authenticated_request(method, endpoint, node_id, **kwargs):
    kwargs['verify'] = False

    config_data = load_config()
    headers = kwargs.get('headers', {})
    headers['nodeId'] = node_id
    headers['deviceType'] = config_data['deviceType']
    kwargs['headers'] = headers

    response = requests.request(method, f'{API_BASE_URL}{endpoint}', **kwargs)
    return response

def download_firmware(download_url):
    print('Downloading firmware...')
    response = requests.get(download_url, stream=True, verify=False)
    if response.status_code == 200:
        with open(FIRMWARE_FILE, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print('Firmware downloaded.')
    else:
        raise Exception(f'Failed to download firmware. HTTP status code: {response.status_code}')

def calculate_hash(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path,"rb") as f:
        for byte_block in iter(lambda: f.read(4096),b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def verify_firmware(node_id, version, firmware_hash):
    response = authenticated_request('POST', '/verifyFirmware', node_id, json={
        'nodeId': node_id,
        'firmwareVersion': version,
        'firmwareHash': firmware_hash
    })
    if response.status_code == 200:
        data = response.json()
        if data.get('verified'):
            print('Firmware verified successfully.')
            return True
        else:
            print('Firmware verification failed.')
            return False
    else:
        raise Exception(f'Failed to verify firmware. Error: {response.text}')

def check_for_updates(node_id):
    current_version = get_current_version(node_id)
    response = authenticated_request('POST', '/checkForUpdate', node_id, json={
        'nodeId': node_id,
        'currentVersion': current_version
    })

    if response.status_code == 200:
        data = response.json()
        if data.get('updateAvailable'):
            firmwareInfo = data.get('firmwareInfo')
            if firmwareInfo:
                print('Update available.')
                return firmwareInfo
            else:
                print('Update available but firmware info is missing.')
                return None
        else:
            print('No update available.')
            return None
    else:
        raise Exception(f'Failed to check for updates. Error: {response.text}')

def get_current_version(node_id):
    response = authenticated_request('POST', '/getCurrentVersion', node_id, json={
        'nodeId': node_id
    })
    if response.status_code == 200:
        data = response.json()
        current_version = data.get('currentVersion')
        print(f'Current firmware version: {current_version}')
        return current_version
    else:
        raise Exception(f'Failed to get current version. Error: {response.text}')

def install_firmware():
    print('Installing firmware...')
    time.sleep(10)
    print('Firmware installation simulated.')

def register_node(node_id, device_type):
    response = authenticated_request('POST', '/registerNode', node_id, json={
        'nodeId': node_id,
        'deviceType': device_type
    }, verify=False)
    if response.status_code == 200:
        print('Node registered successfully.')
    else:
        if 'already registered' in response.text or 'is not registered' not in response.text:
            print('Node is already registered or registration failed with a recoverable error.')
        else:
            raise Exception(f'Failed to register node. Error: {response.text}')

def main():
    try:
        with open(OUTPUT_CSV, mode='w', newline='') as csv_file:
            fieldnames = ['NodeID', 'UpdateDurationSeconds']
            writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
            writer.writeheader()

            for i in range(100):
                node_id = f'a{i}'
                print(f'Processing node {node_id}...')

                register_node(node_id, DEVICE_TYPE)

                start_time = time.time()

                firmware_info = check_for_updates(node_id)
                if firmware_info:
                    version = firmware_info['version']
                    expected_hash = firmware_info['hash']
                    download_url = firmware_info['downloadUrl']
                    download_firmware(download_url)

                    calculated_hash = calculate_hash(FIRMWARE_FILE)
                    if calculated_hash != expected_hash:
                        raise Exception(f'Hash mismatch error: Downloaded firmware hash "{calculated_hash}" does not match the expected hash "{expected_hash}".')

                    if not verify_firmware(node_id, version, calculated_hash):
                        raise Exception('Firmware verification before installation failed.')

                    install_firmware()

                    calculated_hash = calculate_hash(FIRMWARE_FILE)
                    if calculated_hash != expected_hash:
                        raise Exception('Firmware hash after installation does not match expected hash.')

                    if not verify_firmware(node_id, version, calculated_hash):
                        raise Exception('Firmware verification after installation failed.')

                    response = authenticated_request('POST', '/submitUpdate', node_id, json={
                        'firmwareVersion': version,
                        'nodeId' : node_id
                    })
                    if response.status_code == 200:
                        print('Firmware update submitted successfully.')
                    else:
                        raise Exception(f'Failed to submit firmware update. Error: {response.text}')

                    end_time = time.time()
                    update_duration = end_time - start_time
                    print(f'Time taken to complete the firmware update for node {node_id}: {update_duration:.2f} seconds')

                    writer.writerow({'NodeID': node_id, 'UpdateDurationSeconds': update_duration})
                else:
                    print(f'Node {node_id} is up to date.')

    except Exception as e:
        print(f'Error: {e}')

if __name__ == '__main__':
    main()
