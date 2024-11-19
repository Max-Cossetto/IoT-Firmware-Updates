import urequests as requests
import utime as time
import uhashlib as hashlib
import uos as os
import ujson as json
import usocket as socket
import ssl
import network
import gc

# Configuration
API_BASE_URL = 'https://192.168.0.105:3000/api'  # Use HTTPS
FIRMWARE_FILE = 'firmware.bin'
DEVICE_TYPE = 'n100'
UPDATE_LOG_FILE = 'update_log.txt'
WIFI_SSID = 'Mossetto WiFi'
WIFI_PASSWORD = 'B4cxtUret%p!@U3K$e!L'  # Enter the password here

# Connect to Wi-Fi
def connect_to_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(False)
    time.sleep(1)
    wlan.active(True)
    gc.collect()  # Perform garbage collection to free memory before connecting
    
    if not wlan.isconnected():
        print(f'Connecting to network {WIFI_SSID}...')
        if WIFI_PASSWORD:
            wlan.connect(WIFI_SSID, WIFI_PASSWORD)
        else:
            wlan.connect(WIFI_SSID)
        retries = 0
        max_retries = 20  # Increase max retries
        while not wlan.isconnected() and retries < max_retries:
            retries += 1
            print(f'Attempt {retries} to connect...')
            time.sleep(3)  # Increase sleep time to allow for connection stabilization
        if wlan.isconnected():
            print('Network connected:', wlan.ifconfig())
        else:
            print('WiFi connection failed after multiple attempts. Restarting Wi-Fi...')
            wlan.disconnect()
            wlan.active(False)
            time.sleep(5)
            wlan.active(True)
            raise Exception('WiFi connection failed. Please check network credentials or signal strength.')

# Function to make authenticated requests
def authenticated_request(method, endpoint, node_id, data=None):
    headers = {
        'nodeId': node_id,
        'deviceType': DEVICE_TYPE
    }
    if data is not None:
        data = json.dumps(data)

    # Create a socket and wrap it with SSL
    addr_info = socket.getaddrinfo('192.168.0.105', 3000)
    addr = addr_info[0][-1]
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(addr)
    ssock = ssl.wrap_socket(sock, server_hostname='192.168.0.105')

    # Construct the HTTP request
    if method == 'POST':
        request = f"POST {endpoint} HTTP/1.1\r\n"
    elif method == 'GET':
        request = f"GET {endpoint} HTTP/1.1\r\n"
    else:
        return None
    
    request += f"Host: 192.168.0.105\r\n"
    for key, value in headers.items():
        request += f"{key}: {value}\r\n"
    request += "Content-Type: application/json\r\n"
    if data is not None:
        request += f"Content-Length: {len(data)}\r\n"
    request += "\r\n"
    if data is not None:
        request += data
    
    # Send the request
    ssock.write(request.encode())
    
    # Receive the response
    response = ssock.read(4096).decode()
    ssock.close()
    
    # Extract the HTTP response body
    response_body = response.split('\r\n\r\n', 1)[-1]
    try:
        return json.loads(response_body)
    except json.JSONDecodeError:
        return {'status': 'error', 'message': 'Invalid JSON response'}

# Download firmware (simulate download by writing to file)
def download_firmware(download_url):
    print('Downloading firmware...')
    response = requests.get(download_url)
    if response.status_code == 200:
        with open(FIRMWARE_FILE, 'wb') as f:
            f.write(response.content)
        print('Firmware downloaded.')
    else:
        raise Exception(f'Failed to download firmware. HTTP status code: {response.status_code}')

# Calculate firmware hash
def calculate_hash(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            byte_block = f.read(4096)
            if not byte_block:
                break
            sha256_hash.update(byte_block)
    return sha256_hash.digest().hex()

# Verify firmware hash
def verify_firmware(node_id, version, firmware_hash):
    response = authenticated_request('POST', f'{API_BASE_URL}/verifyFirmware', node_id, {
        'nodeId': node_id,
        'firmwareVersion': version,
        'firmwareHash': firmware_hash
    })
    if response and ((response.get('message') == 'Node firmware version updated successfully') or (response.get('verified'))):
        print('Firmware verified successfully.')
        return True
    else:
        print('Firmware verification failed.')
        return False

# Check for firmware updates
def check_for_updates(node_id):
    current_version = get_current_version(node_id)
    response = authenticated_request('POST', f'{API_BASE_URL}/checkForUpdate', node_id, {
        'nodeId': node_id,
        'currentVersion': current_version
    })

    if response and response.get('updateAvailable'):
        firmware_info = response.get('firmwareInfo')
        if firmware_info:
            print('Update available.')
            return firmware_info
        else:
            print('Update available but firmware info is missing.')
            return None
    else:
        print('No update available.')
        return None

# Get current firmware version from the blockchain
def get_current_version(node_id):
    response = authenticated_request('POST', f'{API_BASE_URL}/getCurrentVersion', node_id, {
        'nodeId': node_id
    })
    if response and 'currentVersion' in response:
        current_version = response['currentVersion']
        print(f'Current firmware version: {current_version}')
        return current_version
    else:
        raise Exception('Failed to retrieve current firmware version.')

# Install firmware (simulate with a 10-second timer)
def install_firmware():
    print('Installing firmware...')
    time.sleep(10)  # Simulate installation time
    print('Firmware installation simulated.')

# Register node
def register_node(node_id, device_type):
    response = authenticated_request('POST', f'{API_BASE_URL}/registerNode', node_id, {
        'nodeId': node_id,
        'deviceType': device_type
    })
    if response and response.get('message') == 'Node registered successfully':
        print('Node registered successfully.')
    elif response and ('Edge node' in response.get('details', '') and 'is already registered' in response.get('details', '')):
        print('Node is already registered.')
    else:
        print('Node registration failed with an error:', response)

# Log update details to a text file
def log_update(node_id, update_duration):
    with open(UPDATE_LOG_FILE, 'a') as log_file:
        log_file.write(f'NodeID: {node_id}, UpdateDurationSeconds: {update_duration:.2f}\n')

# Main function to loop through nodes and update firmware
def main():
    try:
        # Connect to Wi-Fi
        connect_to_wifi()

        # Loop through node IDs a0 to a99
        for i in range(99):  # Reduced to 5 iterations for testing
            node_id = f'f{i}'
            print(f'Processing node {node_id}...')

            # Register Node
            register_node(node_id, DEVICE_TYPE)

            # Start the timer after a node has been registered
            start_time = time.ticks_ms()

            # Check for updates
            firmware_info = check_for_updates(node_id)
            if firmware_info:
                version = firmware_info['version']
                expected_hash = firmware_info['hash']
                download_url = firmware_info['downloadUrl']
                download_firmware(download_url)

                # Verify firmware before installation
                calculated_hash = calculate_hash(FIRMWARE_FILE)
                if calculated_hash != expected_hash:
                    raise Exception(f'Hash mismatch error: Downloaded firmware hash "{calculated_hash}" does not match the expected hash "{expected_hash}".')

                if not verify_firmware(node_id, version, calculated_hash):
                    raise Exception('Firmware verification before installation failed.')

                # Install firmware (simulate)
                install_firmware()

                # Notify the blockchain about the firmware update
                response = authenticated_request('POST', f'{API_BASE_URL}/submitUpdate', node_id, {
                    'firmwareVersion': version,
                    'nodeId': node_id
                })
                if response and (response.get('status') == 'success' or response.get('message') == 'Node firmware version updated successfully'):
                    print('Firmware update submitted successfully.')
                else:
                    raise Exception(f'Failed to submit firmware update. Error: {response}')

                end_time = time.ticks_ms()
                update_duration = (end_time - start_time) / 1000.0
                print(f'Time taken to complete the firmware update for node {node_id}: {update_duration:.2f} seconds (measured in ms)')

                # Log the update duration to a text file
                log_update(node_id, update_duration)

            else:
                print(f'Node {node_id} is up to date.')

    except Exception as e:
        print(f'Error: {e}')

if __name__ == '__main__':
    main()