// routes/api.js
const express = require('express');
const router = express.Router();
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');
//const authenticate = require('../middleware/auth');
//const authenticateCert = require('../middleware/authenticateCert'); // Import authenticateAdmin

// Define constants directly
const walletPath = path.join(process.cwd(), 'wallet'); // Adjust the wallet directory as needed
const adminIdentityLabel = 'admin';
const enrollmentID = 'admin';
const enrollmentSecret = 'adminpw'; // Ensure this matches your CA's configuration
const orgMSP = 'Org1MSP'; // Replace with your organization's MSP ID
const caNameOrg1 = 'ca.org1.example.com'; // Replace with your CA's name
const channelName = 'mychannel'; // Replace with your channel name
const chaincodeName = 'firmware_chaincode'; // Replace with your chaincode name
const caCertPath = path.join(process.env.HOME, 'proxy', 'certs', 'ca_cert.pem');

// Load the network configuration (connection profile)
const ccpPath = path.resolve(__dirname, '..', 'connection.json'); // Ensure this path is correct
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

// Endpoint to register a new edge node
router.post('/registerNode', async (req, res) => {
  const { nodeId, deviceType } = req.body;

  if (!nodeId || !deviceType) {
    return res.status(400).json({ error: 'nodeId and deviceType are required' });
  }

  try {
    // Enroll the node with the CA
    await enrollNode(nodeId);

    // Get the contract using the node's identity
    const { contract, gateway } = await getContract();

    // Submit the transaction to register the node on the blockchain
    await contract.submitTransaction('RegisterNode', nodeId, deviceType);

    await gateway.disconnect();

    res.json({ message: 'Node registered successfully' });
  } catch (error) {
    console.error(`Failed to register node: ${error}`);
    res.status(500).json({ error: 'Failed to register node', details: error.message });
  }
});

// router.post('/enrollNode', async (req, res) => {
//   const { nodeId, deviceType } = req.body;

//   try {
//     const wallet = await Wallets.newFileSystemWallet(walletPath);
//     const nodeExists = await wallet.get(nodeId);
//     if (nodeExists) {
//       return res.status(400).json({ error: `Node "${nodeId}" is already enrolled` });
//     }

//     // Initialize Fabric CA client
//     const caInfo = ccp.certificateAuthorities[caNameOrg1];
//     let caTLSCACerts;

//     if (caInfo.tlsCACerts.pem) {
//       caTLSCACerts = caInfo.tlsCACerts.pem;
//     } else if (caInfo.tlsCACerts.path) {
//       caTLSCACerts = fs.readFileSync(caInfo.tlsCACerts.path).toString();
//     } else {
//       throw new Error('CA TLS certificate not found in connection profile');
//     }

//     const ca = new FabricCAServices(
//       caInfo.url,
//       { trustedRoots: caTLSCACerts, verify: false },
//       caInfo.caName
//     );

//     // Enroll the admin if not already enrolled
//     const adminExists = await wallet.get(adminIdentityLabel);
//     if (!adminExists) {
//       await enrollAdmin(ca, wallet);
//     }

//     const adminIdentity = await wallet.get(adminIdentityLabel);
//     const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
//     const adminUser = await provider.getUserContext(adminIdentity, adminIdentityLabel);

//     // Register the node with the CA
//     const secret = await ca.register(
//       {
//         affiliation: 'org1.department1',
//         enrollmentID: nodeId,
//         role: 'client',
//         attrs: [{ name: 'deviceType', value: deviceType, ecert: true }],
//       },
//       adminUser
//     );

//     // Enroll the node
//     const enrollment = await ca.enroll({
//       enrollmentID: nodeId,
//       enrollmentSecret: secret,
//     });

//     const x509Identity = {
//       credentials: {
//         certificate: enrollment.certificate,
//         privateKey: enrollment.key.toBytes(),
//       },
//       mspId: orgMSP,
//       type: 'X.509',
//     };

//     await wallet.put(nodeId, x509Identity);

//     // Return the certificate and private key to the node
//     res.json({
//       certificate: enrollment.certificate,
//       privateKey: enrollment.key.toBytes(),
//     });
//   } catch (error) {
//     console.error(`Failed to enroll node: ${error}`);
//     res.status(500).json({ error: 'Failed to enroll node', details: error.message });
//   }
// });

async function enrollNode(nodeId) {
  const ccpPath = path.resolve(__dirname, '..', 'connection.json');
  const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
  const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
  const caTLSCACerts = caInfo.tlsCACerts.pem;
  const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

  const walletPath = path.join(process.cwd(), 'wallet');
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  // Check to see if we've already enrolled the node
  const identity = await wallet.get(nodeId);
  if (identity) {
    console.log(`An identity for the node ${nodeId} already exists in the wallet`);
    return;
  }

  // Enroll the admin user
  const adminIdentity = await wallet.get('admin');
  if (!adminIdentity) {
    console.log('An identity for the admin user "admin" does not exist in the wallet');
    throw new Error('Admin identity not found');
  }

  const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
  const adminUser = await provider.getUserContext(adminIdentity, 'admin');

  // Register the node, enroll the node, and import the new identity into the wallet
  const secret = await ca.register({
    affiliation: 'org1.department1',
    enrollmentID: nodeId,
    role: 'client'
  }, adminUser);

  const enrollment = await ca.enroll({
    enrollmentID: nodeId,
    enrollmentSecret: secret
  });

  const x509Identity = {
    credentials: {
      certificate: enrollment.certificate,
      privateKey: enrollment.key.toBytes(),
    },
    mspId: 'Org1MSP',
    type: 'X.509',
  };
  await wallet.put(nodeId, x509Identity);
  console.log(`Successfully enrolled node "${nodeId}" and imported it into the wallet`);
}

// Use the authenticate middleware for node routes
//router.use(authenticate);

// Modify getContract to always use 'admin' identity
async function getContract() {
  const identityLabel = 'admin';
  const wallet = await Wallets.newFileSystemWallet(walletPath);
  let identity = await wallet.get(identityLabel);

  if (!identity) {
    // Enroll admin if not enrolled
    const caInfo = ccp.certificateAuthorities[caNameOrg1];
    const caTLSCACerts = caInfo.tlsCACerts.pem || fs.readFileSync(caInfo.tlsCACerts.path).toString();
    const ca = new FabricCAServices(
      caInfo.url,
      { trustedRoots: caTLSCACerts, verify: false },
      caInfo.caName
    );
    await enrollAdmin(ca, wallet);
    identity = await wallet.get(identityLabel);
    if (!identity) {
      throw new Error(`Failed to enroll admin user "${identityLabel}"`);
    }
  }

  const gateway = new Gateway();

  try {
    await gateway.connect(ccp, {
      wallet,
      identity: identityLabel,
      discovery: { enabled: false },
    });
  } catch (error) {
    console.error(`Failed to connect to gateway: ${error.message}`);
    throw new Error(`Failed to connect to gateway: ${error.message}`);
  }

  const network = await gateway.getNetwork(channelName);
  const contract = network.getContract(chaincodeName);

  return { contract, gateway };
}

// // Function to get a contract for a given identity
// async function getContract(identityLabel = 'admin') {
//   const wallet = await Wallets.newFileSystemWallet(walletPath);
//   const identity = await wallet.get(identityLabel);

//   if (!identity) {
//     throw new Error(`An identity for the user "${identityLabel}" does not exist in the wallet`);
//   }

//   const gateway = new Gateway();

//   await gateway.connect(ccp, {
//     wallet,
//     identity: identityLabel,
//     discovery: { enabled: true, asLocalhost: true },
//   });

//   const network = await gateway.getNetwork(channelName);
//   const contract = network.getContract(chaincodeName);

//   return { contract, gateway };
// }

//router.use(authenticateCert);

// Endpoint to upload new firmware (admin only)
router.post('/uploadFirmware', async (req, res) => {
  const { deviceType, firmwareVersion, firmwareHash, downloadUrl } = req.body;
  // // Ensure req.user exists and has the 'admin' role
  // if (!req.user || req.user.role !== 'admin') {
  //   return res.status(403).json({ error: 'Forbidden: Admins only' });
  // }

  try {
    console.log("API received downloadUrl:", downloadUrl);

    const { contract, gateway } = await getContract();

    // Submit the transaction
    await contract.submitTransaction('UploadFirmware', deviceType, firmwareVersion, firmwareHash, downloadUrl);

    await gateway.disconnect();

    res.json({ message: 'Firmware uploaded successfully' });
  } catch (error) {
    console.error(`Failed to upload firmware: ${error}`);
    res.status(500).json({ error: 'Failed to upload firmware', details: error.message });
  }
});

// Use the authenticate middleware for node routes
//router.use(authenticate);

// Endpoint to check for firmware updates
router.post('/checkForUpdate', async (req, res) => {
  try {
    //const nodeId = req.user.nodeId;
    const { nodeId } = req.body;

    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }

    const { contract, gateway } = await getContract();

    // Evaluate transaction to check for updates
    const resultBuffer = await contract.evaluateTransaction('CheckForUpdate', nodeId);

    await gateway.disconnect();

    if (resultBuffer && resultBuffer.length > 0) {
      // An update is available; parse the firmware info
      const firmwareInfo = JSON.parse(resultBuffer.toString());
      res.json({ updateAvailable: true, firmwareInfo });
    } else {
      // No update available
      res.json({ updateAvailable: false });
    }
  } catch (error) {
    console.error(`Failed to check for update: ${error}`);
    res.status(500).json({ error: 'Failed to check for update', details: error.message });
  }
});

// Endpoint to verify firmware
router.post('/verifyFirmware', async (req, res) => {
  const { firmwareVersion, firmwareHash, nodeId } = req.body;

  try {
    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }

    const { contract, gateway } = await getContract(); // Use admin identity

    // Retrieve deviceType from the ledger using nodeId
    const nodeInfoResult = await contract.evaluateTransaction('GetEdgeNodeInfo', nodeId);

    if (!nodeInfoResult || nodeInfoResult.length === 0) {
      console.error('Node info not found');
      throw new Error('Node info not found for nodeId ' + nodeId);
    }

    const nodeInfo = JSON.parse(nodeInfoResult.toString());
    const deviceType = nodeInfo.deviceType || nodeInfo.DeviceType; // Adjust casing if necessary

    // Submit transaction to verify firmware
    let result;
    try {
      result = await contract.submitTransaction('VerifyFirmware', nodeId, deviceType, firmwareVersion, firmwareHash);
    } catch (err) {
      console.error(`Error during submitTransaction: ${err}`);
      throw err;
    }

    if (!result || result.length === 0) {
      console.error('Result from submitTransaction is undefined or empty');
      throw new Error('Result from submitTransaction is undefined or empty');
    }

    const verificationResult = result.toString() === 'true';

    await gateway.disconnect();

    res.json({ verified: verificationResult });
  } catch (error) {
    console.error(`Failed to verify firmware: ${error.stack || error}`);
    res.status(500).json({ error: 'Failed to verify firmware', details: error.message || error });
  }
});

// Endpoint to submit firmware update (after verification and installation)
router.post('/submitUpdate', async (req, res) => {
  const { firmwareVersion, nodeId } = req.body;

  try {
    //const nodeId = req.user.nodeId;
    //const { nodeId } = req.body;

    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }

    const { contract, gateway } = await getContract();

    // Submit transaction to update node's firmware version
    await contract.submitTransaction('UpdateNodeFirmwareVersion', nodeId, firmwareVersion);

    await gateway.disconnect();

    res.json({ message: 'Node firmware version updated successfully' });
  } catch (error) {
    console.error(`Failed to submit firmware update: ${error}`);
    res.status(500).json({ error: 'Failed to submit firmware update', details: error.message });
  }
});

router.post('/getCurrentVersion', async (req, res) => {
  try {
    const { nodeId } = req.body;

    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }

    const { contract, gateway } = await getContract();

    // Call the chaincode function with nodeId
    const result = await contract.evaluateTransaction('GetCurrentFirmwareVersion', nodeId);
    const currentVersion = result.toString();

    await gateway.disconnect();

    res.json({ currentVersion });
  } catch (error) {
    console.error(`Failed to get current version: ${error}`);
    res.status(500).json({ error: 'Failed to get current version', details: error.message });
  }
});

// // Endpoint to get the current firmware version for the node
// router.get('/getCurrentVersion', async (req, res) => {
//   try {
//     const { nodeId, deviceType } = req.body;

//     if (!nodeId || !deviceType) {
//       return res.status(400).json({ error: 'nodeId and deviceType are required' });
//     }

//     const { contract, gateway } = await getContract('admin');

//     // Evaluate transaction to check for updates
//     const resultBuffer = await contract.evaluateTransaction('CheckForUpdate', nodeId, deviceType);

//     await gateway.disconnect();

//     if (resultBuffer && resultBuffer.length > 0) {
//       // An update is available; parse the firmware info
//       const firmwareInfo = JSON.parse(resultBuffer.toString());
//       res.json({ updateAvailable: true, firmwareInfo });
//     } else {
//       // No update available
//       res.json({ updateAvailable: false });
//     }
//   } catch (error) {
//     console.error(`Failed to check for update: ${error}`);
//     res.status(500).json({ error: 'Failed to check for update', details: error.message });
//   }
// });

module.exports = router;

async function enrollAdmin(ca, wallet) {
  try {
    // Check if admin is already enrolled
    const adminExists = await wallet.get(adminIdentityLabel);
    if (adminExists) {
      console.log('Admin identity already exists in the wallet');
      return;
    }

    console.log('Enrolling admin user...');
    const enrollment = await ca.enroll({
      enrollmentID: 'admin',
      enrollmentSecret: 'adminpw',
    });
    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: orgMSP,
      type: 'X.509',
    };
    await wallet.put(adminIdentityLabel, x509Identity);
    console.log('Successfully enrolled admin user and imported it into the wallet');
  } catch (error) {
    console.error(`Failed to enroll admin user: ${error}`);
    throw new Error(`Failed to enroll admin user: ${error.message}`);
  }
}

// async function enrollAdmin(ca, wallet) {
//   try {
//     // Check if admin is already enrolled
//     const adminExists = await wallet.get(adminIdentityLabel);
//     if (adminExists) {
//       console.log('Admin identity already exists in the wallet');
//       return;
//     }

//     console.log('Enrolling admin user...');
//     const enrollment = await ca.enroll({
//       enrollmentID: 'admin',
//       enrollmentSecret: 'adminpw',
//     });
//     const x509Identity = {
//       credentials: {
//         certificate: enrollment.certificate,
//         privateKey: enrollment.key.toBytes(),
//       },
//       mspId: orgMSP,
//       type: 'X.509',
//     };
//     await wallet.put(adminIdentityLabel, x509Identity);
//     console.log('Successfully enrolled admin user and imported it into the wallet');
//   } catch (error) {
//     console.error(`Failed to enroll admin user: ${error}`);
//     throw new Error(`Failed to enroll admin user: ${error.message}`);
//   }
// }

function isVersionGreater(v1, v2) {
  const v1Parts = v1.split('.').map(Number);
  const v2Parts = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const num1 = v1Parts[i] || 0;
    const num2 = v2Parts[i] || 0;

    if (num1 > num2) {
      return true;
    } else if (num1 < num2) {
      return false;
    }
  }
  return false;
}