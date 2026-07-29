// Written exclusively by @Credit200

import * as fs from 'node:fs';
import { promisify } from 'node:util';

import baseX from 'base-x';
import * as bip32 from 'bip32';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import { hdkey } from 'ethereumjs-wallet';

interface Network {
  messagePrefix: string;
  bech32: string;
  bip32: {
    public: number;
    private: number;
  };
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

const litecoinNetwork: Network = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: {
    public: 0x019da462,
    private: 0x019d9cfe,
  },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const dogecoinNetwork: Network = {
  messagePrefix: '\x19Dogecoin Signed Message:\n',
  bech32: 'doge',
  bip32: {
    public: 0x02facafd,
    private: 0x02fac398,
  },
  pubKeyHash: 0x1e,
  scriptHash: 0x16,
  wif: 0x9e,
};

const RIPPLE_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
const BITCOIN_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const rippleBase58 = baseX(RIPPLE_ALPHABET);
const bitcoinBase58 = baseX(BITCOIN_ALPHABET);

function convertRippleAddress(address: string): string {
  const payload = bitcoinBase58.decode(address);
  return rippleBase58.encode(payload);
}

function deriveLitecoinAddress(mnemonic: string, path: string): string | undefined {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, litecoinNetwork);
  const childNode = root.derivePath(path);
  const { address } = bitcoin.payments.p2pkh({
    pubkey: childNode.publicKey,
    network: litecoinNetwork,
  });
  return address;
}

function deriveDogecoinAddress(mnemonic: string, path: string): string | undefined {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, dogecoinNetwork);
  const childNode = root.derivePath(path);
  const { address } = bitcoin.payments.p2pkh({
    pubkey: childNode.publicKey,
    network: dogecoinNetwork,
  });
  return address;
}

function deriveTronAddress(mnemonic: string, path: string): string {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const hdwallet = hdkey.fromMasterSeed(seed);
  const wallet = hdwallet.derivePath(path).getWallet();
  const addressBuffer = wallet.getAddress();
  return bitcoin.address.toBase58Check(addressBuffer, 0x41);
}

function deriveRippleAddress(mnemonic: string, path: string): string | undefined {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);
  const childNode = root.derivePath(path);
  const { address } = bitcoin.payments.p2pkh({
    pubkey: childNode.publicKey,
    network: bitcoin.networks.bitcoin,
  });
  return address ? convertRippleAddress(address) : undefined;
}

function getAddressFromMnemonic(mnemonic: string, cryptoType: string): string | undefined {
  if (cryptoType === 'ETH') {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const hdwallet = hdkey.fromMasterSeed(seed);
    const wallet = hdwallet.derivePath("m/44'/60'/0'/0/0").getWallet();
    return wallet.getAddressString();
  } else if (cryptoType === 'BTC') {
    const root = bip32.fromSeed(bip39.mnemonicToSeedSync(mnemonic));
    const child = root.derivePath("m/84'/0'/0'/0/0");
    return bitcoin.payments.p2wpkh({ pubkey: child.publicKey }).address;
  } else if (cryptoType === 'LTC') {
    return deriveLitecoinAddress(mnemonic, "m/44'/2'/0'/0/0");
  } else if (cryptoType === 'DOGE') {
    return deriveDogecoinAddress(mnemonic, "m/44'/3'/0'/0/0");
  } else if (cryptoType === 'TRX') {
    return deriveTronAddress(mnemonic, "m/44'/195'/0'/0/0");
  } else if (cryptoType === 'XRP') {
    return deriveRippleAddress(mnemonic, "m/44'/144'/0'/0/0");
  } else {
    throw new Error('Unsupported cryptocurrency type');
  }
}

async function getBalance(address: string | undefined, cryptoType: string): Promise<number> {
  if (!address) {
    throw new Error('Invalid address');
  }

  switch (cryptoType) {
    case 'ETH':
      return getEthBalance(address);
    case 'BTC':
      return getBtcBalance(address);
    case 'LTC':
      return getLtcBalance(address);
    case 'DOGE':
      return getDogeBalance(address);
    case 'TRX':
      return getTrxBalance(address);
    case 'XRP':
      return getXrpBalance(address);
    default:
      throw new Error('Unsupported cryptocurrency type');
  }
}

/**
 * Get Ethereum balance for an address
 * @param address - Ethereum address
 * @returns Promise resolving to ETH balance
 */
async function getEthBalance(address: string): Promise<number> {
  const apiKey = 'NF6N7FHJSHMIXZ34XDB4VIBQ8Z6242SW3C';
  const ethBalanceUrl = `https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
  const ethBalanceResponse = await fetch(ethBalanceUrl);
  const ethBalanceData = await ethBalanceResponse.json();
  if (ethBalanceData.status !== '1') {
    return 0;
  }
  return parseFloat(ethBalanceData.result) / 10 ** 18;
}

/**
 * Get Bitcoin balance for an address
 * @param address - Bitcoin address
 * @returns Promise resolving to BTC balance
 */
async function getBtcBalance(address: string): Promise<number> {
  const btcBalanceResponse = await fetch(`https://blockchain.info/rawaddr/${address}`);
  const btcBalanceData = await btcBalanceResponse.json();
  const finalBalance = btcBalanceData?.final_balance;
  if (typeof finalBalance !== 'string' && typeof finalBalance !== 'number') {
    return 0;
  }
  return parseFloat(String(finalBalance)) / 100000000;
}

/**
 * Get Litecoin balance for an address
 * @param address - Litecoin address
 * @returns Promise resolving to LTC balance
 */
async function getLtcBalance(address: string): Promise<number> {
  const ltcBalanceResponse = await fetch(
    `https://api.blockcypher.com/v1/ltc/main/addrs/${address}`,
  );
  const ltcBalanceData = await ltcBalanceResponse.json();
  const finalBalance = ltcBalanceData?.final_balance;
  if (typeof finalBalance !== 'string' && typeof finalBalance !== 'number') {
    return 0;
  }
  return parseFloat(String(finalBalance)) / 100000000;
}

/**
 * Get Dogecoin balance for an address
 * @param address - Dogecoin address
 * @returns Promise resolving to DOGE balance
 */
async function getDogeBalance(address: string): Promise<number> {
  const dogeBalanceResponse = await fetch(
    `https://api.blockcypher.com/v1/doge/main/addrs/${address}`,
  );
  const dogeBalanceData = await dogeBalanceResponse.json();
  const finalBalance = dogeBalanceData?.final_balance;
  if (typeof finalBalance !== 'string' && typeof finalBalance !== 'number') {
    return 0;
  }
  return parseFloat(String(finalBalance)) / 100000000;
}

/**
 * Get Tron balance for an address
 * @param address - Tron address
 * @returns Promise resolving to TRX balance
 */
async function getTrxBalance(address: string): Promise<number> {
  const trxBalanceResponse = await fetch(`https://api.trongrid.io/v1/accounts/${address}`);
  const trxBalanceData = await trxBalanceResponse.json();
  const balance = trxBalanceData?.data?.[0]?.balance;
  if (typeof balance !== 'string' && typeof balance !== 'number') {
    return 0;
  }
  return parseFloat(String(balance)) / 10 ** 6;
}

/**
 * Get Ripple balance for an address
 * @param address - Ripple address
 * @returns Promise resolving to XRP balance
 */
async function getXrpBalance(address: string): Promise<number> {
  const xrpBalanceResponse = await fetch(
    `https://data.ripple.com/v2/accounts/${address}/balances`,
  );
  const xrpBalanceData = await xrpBalanceResponse.json();
  const xrpBalance = xrpBalanceData?.balances?.find(
    (balance: { currency?: string }) => balance.currency === 'XRP',
  );
  const value = xrpBalance?.value;
  if (typeof value !== 'string' && typeof value !== 'number') {
    return 0;
  }
  return parseFloat(String(value));
}

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const PRICE_FILE_PATH = 'prices.json';
const API_UPDATE_INTERVAL = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

async function getUsdBalance(balance: number, cryptoType: string): Promise<number> {
  let cryptoPrice: number;

  // Check if the prices are saved and not stale
  const savedPrices = await readSavedPrices();
  const savedPrice = Object.prototype.hasOwnProperty.call(savedPrices, cryptoType)
    ? savedPrices[cryptoType as keyof typeof savedPrices]
    : undefined;

  if (savedPrice !== undefined && !isStale(savedPrice.timestamp)) {
    cryptoPrice = savedPrice.price;
  } else {
    cryptoPrice = await fetchAndUpdatePrice(cryptoType);
  }

  if (balance !== null && cryptoPrice) {
    return balance * cryptoPrice;
  } else {
    throw new Error('Failed to get balance or USD rate');
  }
}

async function readSavedPrices(): Promise<{
  [key: string]: { price: number; timestamp: number };
}> {
  try {
    const data = await readFile(PRICE_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function fetchAndUpdatePrice(cryptoType: string): Promise<number> {
  let cryptoPrice: number;

  if (cryptoType === 'ETH') {
    const ethPriceUrl =
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';
    const ethPriceResponse = await fetch(ethPriceUrl);
    const ethPriceData = await ethPriceResponse.json();
    cryptoPrice = ethPriceData.ethereum.usd;
  } else if (cryptoType === 'BTC') {
    const btcPriceUrl = 'https://mempool.space/api/v1/prices';
    const btcPriceResponse = await fetch(btcPriceUrl);
    const btcPriceData = await btcPriceResponse.json();
    cryptoPrice = btcPriceData.USD;
  } else if (cryptoType === 'LTC') {
    const ltcPriceUrl =
      'https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd';
    const ltcPriceResponse = await fetch(ltcPriceUrl);
    const ltcPriceData = await ltcPriceResponse.json();
    cryptoPrice = ltcPriceData.litecoin.usd;
  } else if (cryptoType === 'DOGE') {
    const dogePriceUrl =
      'https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd';
    const dogePriceResponse = await fetch(dogePriceUrl);
    const dogePriceData = await dogePriceResponse.json();
    cryptoPrice = dogePriceData.dogecoin.usd;
  } else if (cryptoType === 'TRX') {
    const trxPriceUrl =
      'https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd';
    const trxPriceResponse = await fetch(trxPriceUrl);
    const trxPriceData = await trxPriceResponse.json();
    cryptoPrice = trxPriceData.tron.usd;
  } else if (cryptoType === 'XRP') {
    const xrpPriceUrl =
      'https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd';
    const xrpPriceResponse = await fetch(xrpPriceUrl);
    const xrpPriceData = await xrpPriceResponse.json();
    cryptoPrice = xrpPriceData.ripple.usd;
  } else {
    throw new Error('Unsupported cryptocurrency type');
  }

  const savedPrices = await readSavedPrices();
  const updatedPrices = {
    ...savedPrices,
    [cryptoType]: { price: cryptoPrice, timestamp: Date.now() },
  };
  await writeFile(PRICE_FILE_PATH, JSON.stringify(updatedPrices, null, 2));

  return cryptoPrice;
}

function isStale(timestamp: number): boolean {
  return Date.now() - timestamp >= API_UPDATE_INTERVAL;
}

interface Seed2UsdResult {
  ethAddress: string | undefined;
  btcAddress: string | undefined;
  ltcAddress: string | undefined;
  dogeAddress: string | undefined;
  trxAddress: string | undefined;
  xrpAddress: string | undefined;
  ethUsdBalance: number;
  btcUsdBalance: number;
  ltcUsdBalance: number;
  dogeUsdBalance: number;
  trxUsdBalance: number;
  xrpUsdBalance: number;
  totalUsdBalance: number;
}

export const SUPPORTED_NETWORKS = ['ETH', 'BTC', 'LTC', 'DOGE', 'TRX', 'XRP'] as const;
export type SupportedNetwork = (typeof SUPPORTED_NETWORKS)[number];

/**
 * Derive addresses from a mnemonic for all supported networks.
 * This does not fetch balances or prices.
 */
export function seed2addresses(
  mnemonic: string,
): Record<SupportedNetwork, string | undefined> {
  return {
    ETH: getAddressFromMnemonic(mnemonic, 'ETH'),
    BTC: getAddressFromMnemonic(mnemonic, 'BTC'),
    LTC: getAddressFromMnemonic(mnemonic, 'LTC'),
    DOGE: getAddressFromMnemonic(mnemonic, 'DOGE'),
    TRX: getAddressFromMnemonic(mnemonic, 'TRX'),
    XRP: getAddressFromMnemonic(mnemonic, 'XRP'),
  };
}

/**
 * Calculate USD balance from mnemonic seed phrase for ETH, BTC, LTC, DOGE, TRX, and XRP
 * @param mnemonic - The seed phrase to derive addresses from
 * @returns Promise resolving to balance information
 */
export async function seed2usd(mnemonic: string): Promise<Seed2UsdResult> {
  // Always return a result, even if some coins fail
  const ethAddress = getAddressFromMnemonic(mnemonic, 'ETH');
  const btcAddress = getAddressFromMnemonic(mnemonic, 'BTC');
  const ltcAddress = getAddressFromMnemonic(mnemonic, 'LTC');
  const dogeAddress = getAddressFromMnemonic(mnemonic, 'DOGE');
  const trxAddress = getAddressFromMnemonic(mnemonic, 'TRX');
  const xrpAddress = getAddressFromMnemonic(mnemonic, 'XRP');

  const balances = await getBalancesForAllCurrencies(
    ethAddress,
    btcAddress,
    ltcAddress,
    dogeAddress,
    trxAddress,
    xrpAddress,
  );
  const usdBalances = await getUsdBalancesForAllCurrencies(balances);

  return {
    ethAddress,
    btcAddress,
    ltcAddress,
    dogeAddress,
    trxAddress,
    xrpAddress,
    ethUsdBalance: usdBalances.eth,
    btcUsdBalance: usdBalances.btc,
    ltcUsdBalance: usdBalances.ltc,
    dogeUsdBalance: usdBalances.doge,
    trxUsdBalance: usdBalances.trx,
    xrpUsdBalance: usdBalances.xrp,
    totalUsdBalance:
      usdBalances.eth +
      usdBalances.btc +
      usdBalances.ltc +
      usdBalances.doge +
      usdBalances.trx +
      usdBalances.xrp,
  };
}

/**
 * Get balances for all supported cryptocurrencies
 * @param ethAddress - Ethereum address
 * @param btcAddress - Bitcoin address
 * @param ltcAddress - Litecoin address
 * @param dogeAddress - Dogecoin address
 * @param trxAddress - Tron address
 * @param xrpAddress - Ripple address
 * @returns Promise resolving to balance object
 */
async function getBalancesForAllCurrencies(
  ethAddress: string | undefined,
  btcAddress: string | undefined,
  ltcAddress: string | undefined,
  dogeAddress: string | undefined,
  trxAddress: string | undefined,
  xrpAddress: string | undefined,
): Promise<{ eth: number; btc: number; ltc: number; doge: number; trx: number; xrp: number }> {
  let ethBalance = 0;
  let btcBalance = 0;
  let ltcBalance = 0;
  let dogeBalance = 0;
  let trxBalance = 0;
  let xrpBalance = 0;

  try {
    ethBalance = await getBalance(ethAddress, 'ETH');
  } catch {
    ethBalance = 0;
  }
  try {
    btcBalance = await getBalance(btcAddress, 'BTC');
  } catch {
    btcBalance = 0;
  }
  try {
    ltcBalance = await getBalance(ltcAddress, 'LTC');
  } catch {
    ltcBalance = 0;
  }
  try {
    dogeBalance = await getBalance(dogeAddress, 'DOGE');
  } catch {
    dogeBalance = 0;
  }
  try {
    trxBalance = await getBalance(trxAddress, 'TRX');
  } catch {
    trxBalance = 0;
  }
  try {
    xrpBalance = await getBalance(xrpAddress, 'XRP');
  } catch {
    xrpBalance = 0;
  }

  return {
    eth: ethBalance,
    btc: btcBalance,
    ltc: ltcBalance,
    doge: dogeBalance,
    trx: trxBalance,
    xrp: xrpBalance,
  };
}

/**
 * Get USD balances for all supported cryptocurrencies
 * @param balances - Balance object with crypto amounts
 * @returns Promise resolving to USD balance object
 */
async function getUsdBalancesForAllCurrencies(balances: {
  eth: number;
  btc: number;
  ltc: number;
  doge: number;
  trx: number;
  xrp: number;
}): Promise<{ eth: number; btc: number; ltc: number; doge: number; trx: number; xrp: number }> {
  let ethUsdBalance = 0;
  let btcUsdBalance = 0;
  let ltcUsdBalance = 0;
  let dogeUsdBalance = 0;
  let trxUsdBalance = 0;
  let xrpUsdBalance = 0;

  try {
    ethUsdBalance = await getUsdBalance(balances.eth, 'ETH');
  } catch {
    ethUsdBalance = 0;
  }
  try {
    btcUsdBalance = await getUsdBalance(balances.btc, 'BTC');
  } catch {
    btcUsdBalance = 0;
  }
  try {
    ltcUsdBalance = await getUsdBalance(balances.ltc, 'LTC');
  } catch {
    ltcUsdBalance = 0;
  }
  try {
    dogeUsdBalance = await getUsdBalance(balances.doge, 'DOGE');
  } catch {
    dogeUsdBalance = 0;
  }
  try {
    trxUsdBalance = await getUsdBalance(balances.trx, 'TRX');
  } catch {
    trxUsdBalance = 0;
  }
  try {
    xrpUsdBalance = await getUsdBalance(balances.xrp, 'XRP');
  } catch {
    xrpUsdBalance = 0;
  }

  return {
    eth: ethUsdBalance,
    btc: btcUsdBalance,
    ltc: ltcUsdBalance,
    doge: dogeUsdBalance,
    trx: trxUsdBalance,
    xrp: xrpUsdBalance,
  };
}
