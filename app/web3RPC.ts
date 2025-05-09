import type { IProvider } from "@web3auth/base";
import Web3 from "web3";

const getChainId = async (provider: IProvider): Promise<string> => {
  try {
    const web3 = new Web3(provider);

    // Get the connected Chain's ID
    const chainId = await web3.eth.getChainId();

    return chainId.toString();
  } catch (error) {
    return error as string;
  }
};

const getAccounts = async (provider: IProvider): Promise<any> => {
  try {
    const web3 = new Web3(provider as any);

    // Get user's Ethereum public address
    const address = await web3.eth.getAccounts();

    return address;
  } catch (error) {
    return error;
  }
};

const getBalance = async (provider: IProvider): Promise<string> => {
  try {
    const web3 = new Web3(provider as any);

    // Get user's Ethereum public address
    const address = (await web3.eth.getAccounts())[0];

    // Get user's balance in ether
    const balance = web3.utils.fromWei(
      await web3.eth.getBalance(address), // Balance is in wei
      "ether"
    );

    return balance;
  } catch (error) {
    return error as string;
  }
};

const signMessage = async (provider: IProvider): Promise<string> => {
  try {
    const web3 = new Web3(provider as any);

    // Get user's Ethereum public address
    const fromAddress = (await web3.eth.getAccounts())[0];

    const originalMessage =
      process.env.NEXT_PUBLIC_SIGN_MESSAGE || "YOUR_MESSAGE";

    // Sign the message
    const signedMessage = await web3.eth.personal.sign(
      originalMessage,
      fromAddress,
      "test password!" // configure your own password here.
    );

    return signedMessage;
  } catch (error) {
    return error as string;
  }
};

const sendTransaction = async (provider: IProvider): Promise<any> => {
  try {
    const web3 = new Web3(provider as any);

    // Get user's Ethereum public address
    const address = (await web3.eth.getAccounts())[0];

    // Get user's balance in ether
    const balance = web3.utils.fromWei(
      await web3.eth.getBalance(address), // Balance is in wei
      "ether"
    );

    if (balance === "0") {
      throw new Error(
        "Insufficient balance, please fund your account to use this"
      );
    }

    const amount = web3.utils.toWei(
      process.env.NEXT_PUBLIC_TRANSACTION_AMOUNT || "0.001",
      "ether"
    ); // Convert to wei
    const destination =
      process.env.NEXT_PUBLIC_TRANSACTION_DESTINATION || address;
    let transaction = {
      from: address,
      to: destination,
      data: "0x",
      value: amount,
    };

    // calculate gas transaction before sending
    transaction = {
      ...transaction,
      gas: await web3.eth.estimateGas(transaction),
    } as any;

    // Submit transaction to the blockchain and wait for it to be mined
    const receipt = await web3.eth.sendTransaction(transaction);

    return JSON.stringify(
      receipt,
      (key, value) => (typeof value === "bigint" ? value.toString() : value) // return everything else unchanged
    );
  } catch (error) {
    return error as string;
  }
};

const RPC = {
  getChainId,
  getAccounts,
  getBalance,
  sendTransaction,
  signMessage,
};

export default RPC;
