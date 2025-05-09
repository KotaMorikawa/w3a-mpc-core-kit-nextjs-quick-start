"use client";
import { tssLib } from "@toruslabs/tss-dkls-lib";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import { EthereumSigningProvider } from "@web3auth/ethereum-mpc-provider";
import { Point, secp256k1 } from "@tkey/common-types";
import {
  COREKIT_STATUS,
  FactorKeyTypeShareDescription,
  generateFactorKey,
  JWTLoginParams,
  keyToMnemonic,
  makeEthereumSigner,
  mnemonicToKey,
  parseToken,
  TssShareType,
  WEB3AUTH_NETWORK,
  Web3AuthMPCCoreKit,
} from "@web3auth/mpc-core-kit";
import { BN } from "bn.js";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  UserCredential,
} from "firebase/auth";
import { useEffect, useState } from "react";

// import RPC from "./ethersRPC";
// import RPC from "./viemRPC";
import RPC from "./web3RPC";

const web3AuthClientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID!;

const verifier = process.env.NEXT_PUBLIC_WEB3AUTH_VERIFIER!;

// IMP START - Chain Config
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID!,
  rpcTarget: process.env.NEXT_PUBLIC_RPC_TARGET!,
  // Avoid using public rpcTarget in production.
  // Use services like Infura, Quicknode etc
  displayName: process.env.NEXT_PUBLIC_CHAIN_NAME!,
  blockExplorerUrl: process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL!,
  ticker: process.env.NEXT_PUBLIC_TICKER!,
  tickerName: process.env.NEXT_PUBLIC_TICKER_NAME!,
  logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
};
// IMP END - Chain Config

// IMP START - SDK Initialization
let coreKitInstance: Web3AuthMPCCoreKit;
let evmProvider: EthereumSigningProvider;

if (typeof window !== "undefined") {
  coreKitInstance = new Web3AuthMPCCoreKit({
    web3AuthClientId,
    web3AuthNetwork:
      process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK === "mainnet"
        ? WEB3AUTH_NETWORK.MAINNET
        : WEB3AUTH_NETWORK.DEVNET,
    storage: window.localStorage,
    manualSync: true, // This is the recommended approach
    tssLib,
  });

  // Setup provider for EVM Chain
  evmProvider = new EthereumSigningProvider({ config: { chainConfig } });
  evmProvider.setupProvider(makeEthereumSigner(coreKitInstance));
}
// IMP END - SDK Initialization

// IMP START - Auth Provider Login
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};
// IMP END - Auth Provider Login

function App() {
  const [coreKitStatus, setCoreKitStatus] = useState<COREKIT_STATUS>(
    COREKIT_STATUS.NOT_INITIALIZED
  );
  const [backupFactorKey, setBackupFactorKey] = useState<string>("");
  const [mnemonicFactor, setMnemonicFactor] = useState<string>("");
  const [importEoaMnemonic, setImportEoaMnemonic] = useState<string>("");

  // Firebase Initialisation
  const app = initializeApp(firebaseConfig);

  useEffect(() => {
    const init = async () => {
      // IMP START - SDK Initialization
      if (coreKitInstance.status === COREKIT_STATUS.NOT_INITIALIZED) {
        await coreKitInstance.init();
      }
      // IMP END - SDK Initialization

      setCoreKitStatus(coreKitInstance.status);
    };
    init();
  }, []);

  // IMP START - Auth Provider Login
  const signInWithGoogle = async (): Promise<UserCredential> => {
    try {
      const auth = getAuth(app);
      const googleProvider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, googleProvider);
      console.log(res);
      return res;
    } catch (err) {
      console.error(err);
      throw err;
    }
  };
  // IMP END - Auth Provider Login

  const login = async () => {
    try {
      if (!coreKitInstance) {
        throw new Error("initiated to login");
      }
      // IMP START - Auth Provider Login
      const loginRes = await signInWithGoogle();
      const idToken = await loginRes.user.getIdToken(true);
      const parsedToken = parseToken(idToken);
      // IMP END - Auth Provider Login

      // IMP START - Login
      const idTokenLoginParams: JWTLoginParams = {
        verifier,
        verifierId: parsedToken.sub,
        idToken,
      };

      // インポートするEOAニーモニックがある場合、秘密鍵に変換して設定
      if (importEoaMnemonic.trim()) {
        try {
          uiConsole("Converting mnemonic to private key for importing...");
          const privateKey = mnemonicToKey(importEoaMnemonic.trim());
          idTokenLoginParams.importTssKey = privateKey;
          uiConsole("EOA private key prepared for import");
        } catch (err) {
          uiConsole("Failed to convert mnemonic to private key:", err);
        }
      }

      await coreKitInstance.loginWithJWT(idTokenLoginParams);
      if (coreKitInstance.status === COREKIT_STATUS.LOGGED_IN) {
        await coreKitInstance.commitChanges(); // Needed for new accounts
      }
      // IMP END - Login

      // IMP START - Recover MFA Enabled Account
      if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
        uiConsole(
          "required more shares, please enter your backup/ device factor key, or reset account [unrecoverable once reset, please use it with caution]"
        );
      }
      // IMP END - Recover MFA Enabled Account

      setCoreKitStatus(coreKitInstance.status);
    } catch (err) {
      uiConsole(err);
    }
  };
  // IMP START - Recover MFA Enabled Account
  const inputBackupFactorKey = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!backupFactorKey) {
      throw new Error("backupFactorKey not found");
    }
    const factorKey = new BN(backupFactorKey, "hex");
    await coreKitInstance.inputFactorKey(factorKey);

    setCoreKitStatus(coreKitInstance.status);

    if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
      uiConsole(
        "required more shares even after inputing backup factor key, please enter your backup/ device factor key, or reset account [unrecoverable once reset, please use it with caution]"
      );
    }
  };
  // IMP END - Recover MFA Enabled Account

  // IMP START - Export Social Account Factor
  const getSocialMFAFactorKey = async (): Promise<string> => {
    try {
      // Create a temporary instance of the MPC Core Kit, used to create an encryption key for the Social Factor
      const tempCoreKitInstance = new Web3AuthMPCCoreKit({
        web3AuthClientId,
        web3AuthNetwork: WEB3AUTH_NETWORK.MAINNET,
        storage: window.localStorage,
        tssLib,
      });

      await tempCoreKitInstance.init();

      // Login using Firebase Email Password
      const auth = getAuth(app);
      const res = await signInWithEmailAndPassword(
        auth,
        "custom+jwt@firebase.login",
        "Testing@123"
      );
      uiConsole(res);
      const idToken = await res.user.getIdToken(true);
      const userInfo = parseToken(idToken);

      // Use the Web3Auth SFA SDK to generate an account using the Social Factor
      await tempCoreKitInstance.loginWithJWT({
        verifier,
        verifierId: userInfo.sub,
        idToken,
      });

      // Get the private key using the Social Factor, which can be used as a factor key for the MPC Core Kit
      const factorKey = await tempCoreKitInstance.state.postBoxKey;
      uiConsole("Social Factor Key: ", factorKey);
      setBackupFactorKey(factorKey as string);
      tempCoreKitInstance.logout();
      return factorKey as string;
    } catch (err) {
      uiConsole(err);
      return "";
    }
  };
  // IMP END - Export Social Account Factor

  // IMP START - Enable Multi Factor Authentication
  const enableMFA = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    try {
      const factorKey = new BN(await getSocialMFAFactorKey(), "hex");
      uiConsole("Using the Social Factor Key to Enable MFA, please wait...");
      await coreKitInstance.enableMFA({
        factorKey,
        shareDescription: FactorKeyTypeShareDescription.SocialShare,
      });

      if (coreKitInstance.status === COREKIT_STATUS.LOGGED_IN) {
        await coreKitInstance.commitChanges();
      }

      uiConsole(
        "MFA enabled, device factor stored in local store, deleted hashed cloud key, your backup factor key is associated with the firebase email password account in the app"
      );
    } catch (e) {
      uiConsole(e);
    }
  };
  // IMP END - Enable Multi Factor Authentication

  // IMP START - Delete Factor
  const deleteFactor = async () => {
    let factorPub: string | undefined;
    for (const [key, value] of Object.entries(
      coreKitInstance.getKeyDetails().shareDescriptions
    )) {
      if (value.length > 0) {
        const parsedData = JSON.parse(value[0]);
        if (parsedData.module === FactorKeyTypeShareDescription.SocialShare) {
          factorPub = key;
        }
      }
    }
    if (factorPub) {
      uiConsole(
        "Deleting Social Factor, please wait...",
        "Factor Pub:",
        factorPub
      );
      const pub = Point.fromSEC1(secp256k1, factorPub);
      await coreKitInstance.deleteFactor(pub);
      await coreKitInstance.commitChanges();
      uiConsole("Social Factor deleted");
    } else {
      uiConsole("No social factor found to delete");
    }
  };
  // IMP END - Delete Factor

  const keyDetails = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    uiConsole(coreKitInstance.getKeyDetails());
  };

  const getDeviceFactor = async () => {
    try {
      const factorKey = await coreKitInstance.getDeviceFactor();
      setBackupFactorKey(factorKey as string);
      uiConsole("Device share: ", factorKey);
    } catch (e) {
      uiConsole(e);
    }
  };

  const createMnemonicFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    uiConsole("export share type: ", TssShareType.RECOVERY);
    const factorKey = generateFactorKey();
    await coreKitInstance.createFactor({
      shareType: TssShareType.RECOVERY,
      factorKey: factorKey.private,
      shareDescription: FactorKeyTypeShareDescription.SeedPhrase,
    });
    const factorKeyMnemonic = await keyToMnemonic(
      factorKey.private.toString("hex")
    );
    if (coreKitInstance.status === COREKIT_STATUS.LOGGED_IN) {
      await coreKitInstance.commitChanges();
    }
    uiConsole("Export factor key mnemonic: ", factorKeyMnemonic);
  };

  const MnemonicToFactorKeyHex = async (mnemonic: string) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    try {
      const factorKey = await mnemonicToKey(mnemonic);
      setBackupFactorKey(factorKey);
      return factorKey;
    } catch (error) {
      uiConsole(error);
    }
  };

  const getUserInfo = async () => {
    // IMP START - Get User Information
    const user = coreKitInstance.getUserInfo();
    // IMP END - Get User Information
    uiConsole(user);
  };

  const logout = async () => {
    // IMP START - Logout
    await coreKitInstance.logout();
    // IMP END - Logout
    setCoreKitStatus(coreKitInstance.status);
    uiConsole("logged out");
  };

  // IMP START - Blockchain Calls
  // Check the RPC file for the implementation
  const getAccounts = async () => {
    const address = await RPC.getAccounts(evmProvider);
    uiConsole(address);
  };

  const getBalance = async () => {
    const balance = await RPC.getBalance(evmProvider);
    uiConsole(balance);
  };

  const signMessage = async () => {
    const signedMessage = await RPC.signMessage(evmProvider);
    uiConsole(signedMessage);
  };

  const sendTransaction = async () => {
    uiConsole("Sending Transaction...");
    const transactionReceipt = await RPC.sendTransaction(evmProvider);
    uiConsole(transactionReceipt);
  };
  // IMP END - Blockchain Calls

  const criticalResetAccount = async (): Promise<void> => {
    // This is a critical function that should only be used for testing purposes
    // Resetting your account means clearing all the metadata associated with it from the metadata server
    // The key details will be deleted from our server and you will not be able to recover your account
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    // if (selectedNetwork === WEB3AUTH_NETWORK.MAINNET) {
    //   throw new Error("reset account is not recommended on mainnet");
    // }
    await coreKitInstance.tKey.storageLayer.setMetadata({
      privKey: new BN(coreKitInstance.state.postBoxKey! as string, "hex"),
      input: { message: "KEY_NOT_FOUND" },
    });
    if (coreKitInstance.status === COREKIT_STATUS.LOGGED_IN) {
      await coreKitInstance.commitChanges();
    }
    uiConsole("reset");
    logout();
  };

  function uiConsole(...args: any): void {
    const el = document.querySelector("#console>p");
    if (el) {
      el.innerHTML = JSON.stringify(args || {}, null, 2);
    }
    console.log(...args);
  }

  const loggedInView = (
    <div className="flex-container">
      <div>
        <button onClick={getUserInfo} className="card">
          Get User Info
        </button>
      </div>
      <div>
        <button onClick={keyDetails} className="card">
          Key Details
        </button>
      </div>
      <div>
        <button onClick={enableMFA} className="card">
          Enable MFA
        </button>
      </div>
      <div>
        <button onClick={getAccounts} className="card">
          Get Accounts
        </button>
      </div>
      <div>
        <button onClick={getBalance} className="card">
          Get Balance
        </button>
      </div>
      <div>
        <button onClick={signMessage} className="card">
          Sign Message
        </button>
      </div>
      <div>
        <button onClick={sendTransaction} className="card">
          Send Transaction
        </button>
      </div>
      <div>
        <button onClick={logout} className="card">
          Log Out
        </button>
      </div>
      <div>
        <button onClick={criticalResetAccount} className="card">
          [CRITICAL] Reset Account
        </button>
      </div>
      <div>
        <button onClick={deleteFactor} className="card">
          Delete Social Factor
        </button>
      </div>
      <div>
        <button onClick={createMnemonicFactor} className="card">
          Generate Backup (Mnemonic)
        </button>
      </div>
    </div>
  );

  const unloggedInView = (
    <div className="flex-container">
      <div>
        <h3>標準ログイン</h3>
        <button onClick={login} className="card">
          Login
        </button>
      </div>
      <div>
        <h3>EOAをインポートしてログイン</h3>
        <div>
          <label>EOAニーモニックを入力:</label>
          <input
            value={importEoaMnemonic}
            onChange={(e) => setImportEoaMnemonic(e.target.value)}
            placeholder="12または24単語のニーモニックフレーズ"
            className="full-width"
            style={{ width: "100%", marginBottom: "10px" }}
          />
          <button
            onClick={login}
            className="card"
            disabled={!importEoaMnemonic.trim()}
          >
            EOAをインポートしてログイン
          </button>
        </div>
      </div>
      <div
        className={
          coreKitStatus === COREKIT_STATUS.REQUIRED_SHARE ? "" : "disabledDiv"
        }
      >
        <button onClick={() => getDeviceFactor()} className="card">
          Get Device Factor
        </button>
        <label>Recover Using Mnemonic Factor Key:</label>
        <input
          value={mnemonicFactor}
          onChange={(e) => setMnemonicFactor(e.target.value)}
        ></input>
        <button
          onClick={() => MnemonicToFactorKeyHex(mnemonicFactor)}
          className="card"
        >
          Get Recovery Factor Key using Mnemonic
        </button>
        <button onClick={() => getSocialMFAFactorKey()} className="card">
          Get Social MFA Factor
        </button>
        <label>Backup/ Device Factor: {backupFactorKey}</label>
        <button onClick={() => inputBackupFactorKey()} className="card">
          Input Backup Factor Key
        </button>
        <button onClick={criticalResetAccount} className="card">
          [CRITICAL] Reset Account
        </button>
      </div>
    </div>
  );

  return (
    <div className="container">
      <h1 className="title">
        <a
          target="_blank"
          href="https://web3auth.io/docs/sdk/core-kit/mpc-core-kit/"
          rel="noreferrer"
        >
          Web3Auth MPC Core Kit
        </a>{" "}
        Nextjs Quick Start
      </h1>

      <div className="grid">
        {coreKitStatus === COREKIT_STATUS.LOGGED_IN
          ? loggedInView
          : unloggedInView}
      </div>
      <div id="console" style={{ whiteSpace: "pre-line" }}>
        <p style={{ whiteSpace: "pre-line" }}></p>
      </div>

      <footer className="footer">
        <a
          href="https://github.com/Web3Auth/web3auth-core-kit-examples/tree/main/mpc-core-kit-web/quick-starts/mpc-core-kit-react-quick-start"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source code
        </a>
      </footer>
    </div>
  );
}

export default App;
