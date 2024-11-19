const express = require('express');
const router = express.Router();
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');

const walletPath = path.join(process.cwd(), 'wallet');
const adminIdentityLabel = 'admin';
const orgMSP = 'Org1MSP';
const caNameOrg1 = 'ca.org1.example.com';
const channelName = 'mychannel';
const chaincodeName = 'firmware_chaincode';
const caCertPath = path.join(process.env.HOME, 'proxy', 'certs', 'ca_cert.pem');

const ccpPath = path.resolve(__dirname, '..', 'connection.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

router.post('/registerNode', async (req, res) => {
  const { nodeId, deviceType } = req.body;

  if (!nodeId || !deviceType) {
    return res.status(400).json({ error: 'nodeId and deviceType are required' });
  }

  try {
    await enrollNode(nodeId);

    const { contract, gateway } = await getContract();

    await contract.submitTransaction('RegisterNode', nodeId, deviceType);

    await gateway.disconnect();

    res.json({ message: 'Node registered successfully' });
  } catch (error) {
    console.error(`Failed to register node: ${error}`);
    res.status(500).json({ error: 'Failed to register node', details: error.message });
  }
});

async function enrollNode(nodeId) {
  const ccpPath = path.resolve(__dirname, '..', 'connection.json');
  const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
  const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
  const caTLSCACerts = caInfo.tlsCACerts.pem;
  const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

  const walletPath = path.join(process.cwd(), 'wallet');
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  const identity = await wallet.get(nodeId);
  if (identity) {
    console.log(`An identity for the node ${nodeId} already exists in the wallet`);
    return;
  }

  const adminIdentity = await wallet.get('admin');
  if (!adminIdentity) {
    console.log('An identity for the admin user "admin" does not exist in the wallet');
    throw new Error('Admin identity not found');
  }

  const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
  const adminUser = await provider.getUserContext(adminIdentity, 'admin');

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

async function getContract() {
  const identityLabel = 'admin';
  const wallet = await Wallets.newFileSystemWallet(walletPath);
  let identity = await wallet.get(identityLabel);

  if (!identity) {
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

router.post('/uploadFirmware', async (req, res) => {
  const { deviceType, firmwareVersion, firmwareHash, downloadUrl } = req.body;
  try {
    console.log("API received downloadUrl:", downloadUrl);

    const { contract, gateway } = await getContract();

    await contract.submitTransaction('UploadFirmware', deviceType, firmwareVersion, firmwareHash, downloadUrl);

    await gateway.disconnect();

    res.json({ message: 'Firmware uploaded successfully' });
  } catch (error) {
    console.error(`Failed to upload firmware: ${error}`);
    res.status(500).json({ error: 'Failed to upload firmware', details: error.message });
  }
});

router.post('/checkForUpdate', async (req, res) => {
  try {
    const { nodeId } = req.body;

    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }

    const { contract, gateway } = await getContract();

    const resultBuffer = await contract.evaluateTransaction('CheckForUpdate', nodeId);

    await gateway.disconnect();

    if (resultBuffer && resultBuffer.length > 0) {
      const firmwareInfo = JSON.parse(resultBuffer.toString());
      res.json({ updateAvailable: true, firmwareInfo });
    } else {
      res.json({ updateAvailable: false });
    }
  } catch (error) {
    console.error(`Failed to check for update: ${error}`);
    res.status(500).json({ error: 'Failed to check for update', details: error.message });
  }
});

router.post('/verifyFirmware', async (req, res) => {
  const { firmwareVersion, firmwareHash, nodeId } = req.body;

  try {
    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }

    const { contract, gateway } = await getContract();

    const nodeInfoResult = await contract.evaluateTransaction('GetEdgeNodeInfo', nodeId);

    if (!nodeInfoResult || nodeInfoResult.length === 0) {
      console.error('Node info not found');
      throw new Error('Node info not found for nodeId ' + nodeId);
    }

    const nodeInfo = JSON.parse(nodeInfoResult.toString());
    const deviceType = nodeInfo.deviceType || nodeInfo.DeviceType;

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

router.post('/submitUpdate', async (req, res) => {
  const { firmwareVersion, nodeId } = req.body;

  try {
    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required' });
    }

    const { contract, gateway } = await getContract();

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

    const result = await contract.evaluateTransaction('GetCurrentFirmwareVersion', nodeId);
    const currentVersion = result.toString();

    await gateway.disconnect();

    res.json({ currentVersion });
  } catch (error) {
    console.error(`Failed to get current version: ${error}`);
    res.status(500).json({ error: 'Failed to get current version', details: error.message });
  }
});

module.exports = router;

async function enrollAdmin(ca, wallet) {
  try {
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
