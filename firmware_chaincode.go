package main

import (
    "encoding/json"
    "fmt"
    "strconv"
    "strings"
    "time"

    "github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract provides functions for firmware management
type SmartContract struct {
    contractapi.Contract
}

// Firmware represents the firmware metadata
type Firmware struct {
    DeviceType  string `json:"deviceType"`
    Version     string `json:"version"`
    Hash        string `json:"hash"`
    DownloadURL string `json:"downloadUrl"`
    Developer   string `json:"developer"`
    UploadTime  string `json:"uploadTime"`
}

// EdgeNode represents an IoT edge node
type EdgeNode struct {
    NodeID         string `json:"nodeId"`
    DeviceType     string `json:"deviceType"`
    CurrentVersion string `json:"currentVersion"`
    Status         string `json:"status"`
    LastUpdated    string `json:"lastUpdated"`
}

// UploadFirmware allows an admin to upload firmware metadata
func (s *SmartContract) UploadFirmware(ctx contractapi.TransactionContextInterface, deviceType, version, hash, downloadURL string) error {
    // Construct firmware key
    firmwareKey := fmt.Sprintf("FW_%s_%s", deviceType, version)

    exists, err := s.firmwareExists(ctx, deviceType, version)
    if err != nil {
        return err
    }
    if exists {
        return fmt.Errorf("Firmware version %s for device type %s already exists", version, deviceType)
    }

    // Get the developer's identity
    developerID, err := ctx.GetClientIdentity().GetID()
    if err != nil {
        developerID = "admin"
    }

    firmware := Firmware{
        DeviceType:  deviceType,
        Version:     version,
        Hash:        hash,
        DownloadURL: downloadURL,
        Developer:   developerID,
        UploadTime:  time.Now().Format(time.RFC3339),
    }

    fmt.Printf("Chaincode received downloadURL: %s\n", downloadURL)

    firmwareJSON, err := json.Marshal(firmware)
    if err != nil {
        return err
    }

    // Store the firmware
    err = ctx.GetStub().PutState(firmwareKey, firmwareJSON)
    if err != nil {
        return err
    }

    // Update the latest firmware key
    latestFirmwareKey := fmt.Sprintf("LATEST_FW_%s", deviceType)
    err = ctx.GetStub().PutState(latestFirmwareKey, firmwareJSON)
    if err != nil {
        return fmt.Errorf("failed to update latest firmware: %v", err)
    }

    hashKey := fmt.Sprintf("HASH_%s", hash)
    err = ctx.GetStub().PutState(hashKey, []byte(firmwareKey))
    if err != nil {
        return fmt.Errorf("failed to store hash mapping: %v", err)
    }

    fmt.Printf("Uploaded firmware: DeviceType=%s, Version=%s\n", deviceType, version)
    fmt.Printf("Firmware Key: %s\n", firmwareKey)

    return nil
}

// RegisterNode registers a new edge node
func (s *SmartContract) RegisterNode(ctx contractapi.TransactionContextInterface, nodeID string, deviceType string) error {
    // Get the node's MSP ID and certificate
    // nodeID, err := s.getSubmittingClientIdentity(ctx)
    // if err != nil {
    //     return nil, err
    // }
    nodeKey := fmt.Sprintf("NODE_%s", nodeID)

    // Check if the node is already registered
    nodeExists, err := s.edgeNodeExists(ctx, nodeID)
    if err != nil {
        return err
    }
    if nodeExists {
        return fmt.Errorf("Edge node %s is already registered", nodeID)
    }

    // Create a new EdgeNode
    edgeNode := EdgeNode{
        NodeID:         nodeID,
        DeviceType:     deviceType,
        CurrentVersion: "1.0.0",
        Status:         "Registered",
        LastUpdated:    time.Now().Format(time.RFC3339),
    }

    edgeNodeJSON, err := json.Marshal(edgeNode)
    if err != nil {
        return err
    }

    // Store the EdgeNode on the ledger
    err = ctx.GetStub().PutState(nodeKey, edgeNodeJSON)
    if err != nil {
        return err
    }

    fmt.Printf("Registered new edge node: %s\n", nodeID)
    return nil
}

// Unexported helper methods

func (s *SmartContract) edgeNodeExists(ctx contractapi.TransactionContextInterface, nodeID string) (bool, error) {
    nodeKey := fmt.Sprintf("NODE_%s", nodeID)
    nodeJSON, err := ctx.GetStub().GetState(nodeKey)
    if err != nil {
        return false, err
    }
    return nodeJSON != nil, nil
}

func (s *SmartContract) firmwareExists(ctx contractapi.TransactionContextInterface, deviceType, version string) (bool, error) {
    firmwareKey := fmt.Sprintf("FW_%s_%s", deviceType, version)
    firmwareJSON, err := ctx.GetStub().GetState(firmwareKey)
    if err != nil {
        return false, err
    }
    return firmwareJSON != nil, nil
}

// func (s *SmartContract) getSubmittingClientIdentity(ctx contractapi.TransactionContextInterface) (string, error) {
//     // Get the client's serialized identity
//     creatorBytes, err := ctx.GetStub().GetCreator()
//     if err != nil {
//         return "", fmt.Errorf("failed to get client identity: %v", err)
//     }

//     // Deserialize the identity to extract the certificate
//     sId := &msp.SerializedIdentity{}
//     err = proto.Unmarshal(creatorBytes, sId)
//     if err != nil {
//         return "", fmt.Errorf("failed to unmarshal SerializedIdentity: %v", err)
//     }

//     block, _ := pem.Decode(sId.IdBytes)
//     if block == nil {
//         return "", fmt.Errorf("failed to decode PEM block containing the certificate")
//     }
//     cert, err := x509.ParseCertificate(block.Bytes)
//     if err != nil {
//         return "", fmt.Errorf("failed to parse certificate: %v", err)
//     }

//     // Extract the Common Name (CN) from the certificate's subject
//     return cert.Subject.CommonName, nil
// }

// VerifyFirmware allows an edge node to verify the firmware hash
func (s *SmartContract) VerifyFirmware(ctx contractapi.TransactionContextInterface, nodeID string, deviceType, version, hash string) (bool, error) {
    // nodeID, err := s.getSubmittingClientIdentity(ctx)
    // if err != nil {
    //     return false, err
    // }

    // Retrieve the firmware from the ledger
    firmwareKey := fmt.Sprintf("FW_%s_%s", deviceType, version)
    firmwareJSON, err := ctx.GetStub().GetState(firmwareKey)
    if err != nil {
        return false, err
    }
    if firmwareJSON == nil {
        return false, fmt.Errorf("Firmware version %s for device type %s does not exist", version, deviceType)
    }

    var firmware Firmware
    err = json.Unmarshal(firmwareJSON, &firmware)
    if err != nil {
        return false, err
    }

    if firmware.Hash != hash {
        return false, nil
    }

    // Record that the node has verified the firmware
    verificationKey := fmt.Sprintf("VERIFIED_%s_%s_%s", deviceType, version, nodeID)
    err = ctx.GetStub().PutState(verificationKey, []byte(time.Now().Format(time.RFC3339)))
    if err != nil {
        return false, err
    }

    return true, nil
}

// GetFirmwareInfo retrieves firmware metadata for a given device type and version
func (s *SmartContract) GetFirmwareInfo(ctx contractapi.TransactionContextInterface, deviceType, version string) (*Firmware, error) {
	firmwareKey := fmt.Sprintf("FW_%s_%s", deviceType, version)
	firmwareJSON, err := ctx.GetStub().GetState(firmwareKey)
	if err != nil {
		return nil, err
	}
	if firmwareJSON == nil {
		return nil, fmt.Errorf("Firmware version %s for device type %s does not exist", version, deviceType)
	}

	var firmware Firmware
	err = json.Unmarshal(firmwareJSON, &firmware)
	if err != nil {
		return nil, err
	}

	fmt.Printf("Retrieving firmware: DeviceType=%s, Version=%s\n", deviceType, version)
	fmt.Printf("Firmware Key: %s\n", firmwareKey)

	return &firmware, nil
}

// GetEdgeNodeInfo retrieves information about a registered edge node
func (s *SmartContract) GetEdgeNodeInfo(ctx contractapi.TransactionContextInterface, nodeID string) (*EdgeNode, error) {
	// nodeID, err := s.getSubmittingClientIdentity(ctx)
    // if err != nil {
    //     return nil, err
    // }
    nodeKey := fmt.Sprintf("NODE_%s", nodeID)
	nodeJSON, err := ctx.GetStub().GetState(nodeKey)
	if err != nil {
		return nil, err
	}
	if nodeJSON == nil {
		return nil, fmt.Errorf("Edge node %s is not registered", nodeID)
	}

	var edgeNode EdgeNode
	err = json.Unmarshal(nodeJSON, &edgeNode)
	if err != nil {
		return nil, err
	}

	return &edgeNode, nil
}

func (s *SmartContract) GetFirmwareByHash(ctx contractapi.TransactionContextInterface, deviceType, hash string) (*Firmware, error) {
    hashKey := fmt.Sprintf("HASH_%s", hash)
    firmwareKeyBytes, err := ctx.GetStub().GetState(hashKey)
    if err != nil || firmwareKeyBytes == nil {
        return nil, fmt.Errorf("firmware hash not found")
    }

    firmwareBytes, err := ctx.GetStub().GetState(string(firmwareKeyBytes))
    if err != nil || firmwareBytes == nil {
        return nil, fmt.Errorf("firmware data not found")
    }

    var firmware Firmware
    err = json.Unmarshal(firmwareBytes, &firmware)
    if err != nil {
        return nil, err
    }

    if firmware.DeviceType != deviceType {
        return nil, fmt.Errorf("firmware device type mismatch")
    }

    return &firmware, nil
}

func (s *SmartContract) GetCurrentFirmwareVersion(ctx contractapi.TransactionContextInterface, nodeID string) (string, error) {
    // nodeID, err := s.getSubmittingClientIdentity(ctx)
    // if err != nil {
    //     return "", err
    // }

    // Retrieve node information
    nodeKey := fmt.Sprintf("NODE_%s", nodeID)
    nodeJSON, err := ctx.GetStub().GetState(nodeKey)
    if err != nil {
        return "", err
    }
    if nodeJSON == nil {
        return "", fmt.Errorf("Edge node %s is not registered", nodeID)
    }

    var edgeNode EdgeNode
    err = json.Unmarshal(nodeJSON, &edgeNode)
    if err != nil {
        return "", err
    }

    return edgeNode.CurrentVersion, nil
}

func (s *SmartContract) UpdateNodeFirmwareVersion(ctx contractapi.TransactionContextInterface, nodeID string, newVersion string) error {
    // nodeID, err := s.getSubmittingClientIdentity(ctx)
    // if err != nil {
    //     return err
    // }

    nodeKey := fmt.Sprintf("NODE_%s", nodeID)
    nodeJSON, err := ctx.GetStub().GetState(nodeKey)
    if err != nil {
        return err
    }
    if nodeJSON == nil {
        return fmt.Errorf("Edge node %s is not registered", nodeID)
    }

    var edgeNode EdgeNode
    err = json.Unmarshal(nodeJSON, &edgeNode)
    if err != nil {
        return err
    }

    edgeNode.CurrentVersion = newVersion
    edgeNode.LastUpdated = time.Now().Format(time.RFC3339)

    updatedNodeJSON, err := json.Marshal(edgeNode)
    if err != nil {
        return err
    }

    err = ctx.GetStub().PutState(nodeKey, updatedNodeJSON)
    if err != nil {
        return err
    }

    fmt.Printf("Updated node %s firmware version to %s\n", nodeID, newVersion)
    return nil
}

func (s *SmartContract) CheckForUpdate(ctx contractapi.TransactionContextInterface, nodeID string) (*Firmware, error) {
    // nodeID, err := s.getSubmittingClientIdentity(ctx)
    // if err != nil {
    //     return nil, err
    // }

    // Retrieve node information
    nodeKey := fmt.Sprintf("NODE_%s", nodeID)
    nodeJSON, err := ctx.GetStub().GetState(nodeKey)
    if err != nil {
        return nil, err
    }
    if nodeJSON == nil {
        return nil, fmt.Errorf("Edge node %s is not registered", nodeID)
    }

    var edgeNode EdgeNode
    err = json.Unmarshal(nodeJSON, &edgeNode)
    if err != nil {
        return nil, err
    }

    // Retrieve latest firmware for the device type
    latestFirmware, err := s.getLatestFirmware(ctx, edgeNode.DeviceType)
    if err != nil {
        return nil, err
    }

    // Compare versions
    if isVersionGreater(latestFirmware.Version, edgeNode.CurrentVersion) {
        return latestFirmware, nil
    } else {
        return nil, nil
    }
}

// Helper function to compare versions
func isVersionGreater(v1, v2 string) bool {
    v1Parts := strings.Split(v1, ".")
    v2Parts := strings.Split(v2, ".")

    for i := 0; i < len(v1Parts) || i < len(v2Parts); i++ {
        var num1, num2 int

        if i < len(v1Parts) {
            num1, _ = strconv.Atoi(v1Parts[i])
        }
        if i < len(v2Parts) {
            num2, _ = strconv.Atoi(v2Parts[i])
        }

        if num1 > num2 {
            return true
        } else if num1 < num2 {
            return false
        }
    }
    return false
}

// getLatestFirmware retrieves the latest firmware for a given device type
func (s *SmartContract) getLatestFirmware(ctx contractapi.TransactionContextInterface, deviceType string) (*Firmware, error) {
    latestFirmwareKey := fmt.Sprintf("LATEST_FW_%s", deviceType)
    firmwareJSON, err := ctx.GetStub().GetState(latestFirmwareKey)
    if err != nil {
        return nil, fmt.Errorf("failed to get latest firmware: %v", err)
    }
    if firmwareJSON == nil {
        return nil, fmt.Errorf("no firmware found for device type %s", deviceType)
    }

    var firmware Firmware
    err = json.Unmarshal(firmwareJSON, &firmware)
    if err != nil {
        return nil, err
    }

    return &firmware, nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		fmt.Printf("Error creating firmware chaincode: %s", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting firmware chaincode: %s", err)
	}
}