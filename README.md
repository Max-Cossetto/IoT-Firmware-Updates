# IoT Firmware Updates with Blockchain

## Overview
This repository contains the source code and documentation for managing over-the-air (OTA) firmware updates for IoT devices using Hyperledger Fabric and other tools. The system ensures secure, verifiable, and efficient firmware updates for IoT devices.

## File Structure
- `firmware_chaincode/`: Contains the Hyperledger Fabric chaincode to manage firmware update transactions on the blockchain.
- `scripts/`: Python scripts for downloading, verifying, and installing firmware updates on IoT devices.
  - `mpyupdate.py`: Designed for IoT devices running MicroPython.
  - `testupdate.py`: Used for simulating firmware update workflows and logging results.
- `api/`: Express.js API for interacting with the blockchain and IoT devices.

## Setup
### Prerequisites
#### Operating System
Ubuntu 24.04.1 LTS (server edition) with Linux kernel 5.15.0-122-generic.
Long-term support ensures stability and reliability for critical blockchain services.

#### Containerization and Orchestration
Docker 27.3.1: For containerizing Hyperledger Fabric components.
Docker Compose 2.6.0: To simplify multi-container deployments.

#### Blockchain Framework
Hyperledger Fabric 2.5.10: The permissioned blockchain platform used for implementing the OTA firmware update mechanism.
    
#### Programming Languages and Tools
Go 1.16.7: Required to develop and compile Hyperledger Fabric chaincode.
Node.js 18.19.1 and npm 9.2.0: For developing the API server to interface with the blockchain.
Python 3.10.12: Used for scripting, automation, and testing OTA updates.
PM2 5.4.2: Node.js process manager for high availability and monitoring.

#### Version Control and Networking Tools
Git 2.34.1: For version control of the codebase.
Curl 7.81.0 and Wget 1.12.2: For transferring data and debugging network connections.

#### Decentralized Storage
IPFS 0.17.0: For storing firmware binaries. CIDs (Content Identifiers) were used for immutable referencing on the blockchain.

### Installation
Clone the repository:
   ```bash
   git clone https://github.com/username/IoT-Firmware-Updates.git
   cd IoT-Firmware-Updates
