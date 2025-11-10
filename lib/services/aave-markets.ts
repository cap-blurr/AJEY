import { createPublicClient, defineChain, http } from "viem";

// Minimal ABIs
const IPool_ABI = [
  { name: "getReservesList", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address[]", name: "" }] },
  { name: "getReserveAToken", type: "function", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "", type: "address" }] },
  { name: "getReserveVariableDebtToken", type: "function", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "", type: "address" }] },
] as const;

const IPool_getReserveData_V320 = [{
  name: "getReserveData",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "asset", type: "address" }],
  outputs: [{
    name: "",
    type: "tuple",
    components: [
      { name: "configuration", type: "tuple", components: [{ name: "data", type: "uint256" }] },
      { name: "liquidityIndex", type: "uint128" },
      { name: "currentLiquidityRate", type: "uint128" },
      { name: "variableBorrowIndex", type: "uint128" },
      { name: "currentVariableBorrowRate", type: "uint128" },
      { name: "__deprecatedStableBorrowRate", type: "uint128" },
      { name: "lastUpdateTimestamp", type: "uint40" },
      { name: "id", type: "uint16" },
      { name: "liquidationGracePeriodUntil", type: "uint40" },
      { name: "aTokenAddress", type: "address" },
      { name: "__deprecatedStableDebtTokenAddress", type: "address" },
      { name: "variableDebtTokenAddress", type: "address" },
      { name: "interestRateStrategyAddress", type: "address" },
      { name: "accruedToTreasury", type: "uint128" },
      { name: "unbacked", type: "uint128" },
      { name: "isolationModeTotalDebt", type: "uint128" },
    ],
  }],
}] as const;

const IPool_getReserveData_V31 = [{
  name: "getReserveData",
  type: "function",
  stateMutability: "view",
  inputs: [{ name: "asset", type: "address" }],
  outputs: [{
    name: "",
    type: "tuple",
    components: [
      { name: "configuration", type: "tuple", components: [{ name: "data", type: "uint256" }] },
      { name: "liquidityIndex", type: "uint128" },
      { name: "currentLiquidityRate", type: "uint128" },
      { name: "variableBorrowIndex", type: "uint128" },
      { name: "currentVariableBorrowRate", type: "uint128" },
      { name: "__deprecatedStableBorrowRate", type: "uint128" },
      { name: "lastUpdateTimestamp", type: "uint40" },
      { name: "id", type: "uint16" },
      { name: "aTokenAddress", type: "address" },
      { name: "__deprecatedStableDebtTokenAddress", type: "address" },
      { name: "variableDebtTokenAddress", type: "address" },
      { name: "interestRateStrategyAddress", type: "address" },
      { name: "accruedToTreasury", type: "uint128" },
      { name: "unbacked", type: "uint128" },
      { name: "isolationModeTotalDebt", type: "uint128" },
    ],
  }],
}] as const;

const AaveOracle_ABI = [
  { name: "getAssetsPrices", type: "function", stateMutability: "view", inputs: [{ name: "assets", type: "address[]" }], outputs: [{ name: "", type: "uint256[]" }] },
  { name: "BASE_CURRENCY_UNIT", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const PoolAddressesProvider_ABI = [
  { name: "getPool", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "getPriceOracle", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

const ERC20_MIN_ABI = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string", name: "" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8", name: "" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256", name: "" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const ONE_BI = BigInt(1);
const TEN_BI = BigInt(10);

function extractBits(n: bigint, start: number, length: number) {
  const mask = (ONE_BI << BigInt(length)) - ONE_BI;
  return (n >> BigInt(start)) & mask;
}

function decodeReserveConfigurationMap(configData: bigint | undefined) {
  if (!configData && configData !== BigInt(0)) return undefined;
  const d = BigInt(configData);
  const decimals = Number(extractBits(d, 48, 8));
  const isActive = extractBits(d, 56, 1) === ONE_BI;
  const isFrozen = extractBits(d, 57, 1) === ONE_BI;
  const reserveFactorBps = Number(extractBits(d, 64, 16));
  const supplyCapRaw = extractBits(d, 116, 36).toString();
  return { tokenDecimals: decimals, isActive, isFrozen, reserveFactorBps, supplyCapRaw };
}

function toPercentFromRay(ray: bigint | undefined): number | undefined {
  if (ray === undefined) return undefined;
  // Avoid floating large Numbers; divide stepwise in BigInt then to Number
  const RAY = BigInt(1_000_000_000_000_000_000_000_000_000); // 1e27 as BigInt
  const hundred = BigInt(100);
  const num = (ray * hundred);
  const per = num / RAY;
  return Number(per);
}

async function readReserveDataFlexible(pool: `0x${string}`, asset: `0x${string}`) {
  const abis = [IPool_getReserveData_V320, IPool_getReserveData_V31];
  for (const abi of abis) {
    try {
      const data: any = await ethClient.readContract({ address: pool, abi, functionName: "getReserveData", args: [asset] });
      return data;
    } catch {}
  }
  return undefined;
}

export type AaveReserveSnapshot = {
  asset: `0x${string}`;
  symbol: string;
  decimals: number;
  aToken: `0x${string}`;
  variableDebtToken: `0x${string}`;
  supplyAprPercent?: number;
  utilizationPercent?: number;
  availableLiquidityNative?: string;
  tvlUSD?: number;
  availableUSD?: number;
  capacityHeadroomUSD?: string;
  isActive?: boolean;
  isFrozen?: boolean;
};

// Ethereum mainnet client for Aave reads (chain id 1)
const MAINNET_RPC_URL =
  (process.env.ETH_MAINNET_RPC_URL ||
    process.env.NEXT_PUBLIC_ETH_MAINNET_RPC_URL ||
    "https://eth.llamarpc.com");
const MAINNET_CHAIN_ID = 1;
const mainnetChain = defineChain({
  id: MAINNET_CHAIN_ID,
  name: "Ethereum",
  network: "ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [MAINNET_RPC_URL] }, public: { http: [MAINNET_RPC_URL] } },
  testnet: false,
});
const ethClient = createPublicClient({ chain: mainnetChain, transport: http(MAINNET_RPC_URL) });

export async function fetchAaveSupplySnapshot(): Promise<{ network: "ethereum"; reserves: AaveReserveSnapshot[]; asOfBlock: string }> {
  // Canonical Aave v3 Ethereum PoolAddressesProvider
  const MAINNET_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb" as `0x${string}`;
  const ADDRESSES_PROVIDER = ((process.env.AAVE_ADDRESSES_PROVIDER as `0x${string}` | undefined) || MAINNET_ADDRESSES_PROVIDER) as `0x${string}`;

  // Discover Pool + Oracle from the provider
  const [POOL, ORACLE] = await Promise.all([
    ethClient.readContract({ address: ADDRESSES_PROVIDER, abi: PoolAddressesProvider_ABI, functionName: "getPool" }) as Promise<`0x${string}`>,
    ethClient.readContract({ address: ADDRESSES_PROVIDER, abi: PoolAddressesProvider_ABI, functionName: "getPriceOracle" }) as Promise<`0x${string}`>,
  ]);

  const baseUnit = await ethClient.readContract({ address: ORACLE, abi: AaveOracle_ABI, functionName: "BASE_CURRENCY_UNIT" }) as bigint;

  // Reserves list → filter to allowed canonical assets
  const reservesAll = await ethClient.readContract({ address: POOL, abi: IPool_ABI, functionName: "getReservesList" }) as `0x${string}`[];
  const ADDRS = {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  } as const;
  const allowed = new Set(Object.values(ADDRS).map((a) => a.toLowerCase()));
  const reserves = reservesAll.filter((a) => allowed.has(a.toLowerCase()));

  // Batch price fetch for focus set
  const prices = await ethClient.readContract({ address: ORACLE, abi: AaveOracle_ABI, functionName: "getAssetsPrices", args: [reserves] }) as bigint[];

  const out: AaveReserveSnapshot[] = await Promise.all(reserves.map(async (asset, i) => {
    // Read reserve data + token metadata
    const [resData, dec, sym] = await Promise.all([
      readReserveDataFlexible(POOL, asset),
      ethClient.readContract({ address: asset, abi: ERC20_MIN_ABI, functionName: "decimals" }) as Promise<number>,
      ethClient.readContract({ address: asset, abi: ERC20_MIN_ABI, functionName: "symbol" }) as Promise<string>,
    ]);

    // Derive aToken address (prefer reserveData.aTokenAddress; fallback to explicit getter)
    let aToken: `0x${string}` = (resData?.aTokenAddress || resData?.[8]) as `0x${string}`;
    if (!aToken) {
      try { aToken = await ethClient.readContract({ address: POOL, abi: IPool_ABI, functionName: "getReserveAToken", args: [asset] }) as `0x${string}`; } catch {}
    }

    // Variable debt token (optional)
    let vDebt: `0x${string}` = "0x0000000000000000000000000000000000000000";
    try { vDebt = await ethClient.readContract({ address: POOL, abi: IPool_ABI, functionName: "getReserveVariableDebtToken", args: [asset] }) as `0x${string}`; } catch {}

    const [aTokenSupply, underlyingBal] = await Promise.all([
      ethClient.readContract({ address: aToken, abi: ERC20_MIN_ABI, functionName: "totalSupply" }) as Promise<bigint>,
      ethClient.readContract({ address: asset, abi: ERC20_MIN_ABI, functionName: "balanceOf", args: [aToken] }) as Promise<bigint>,
    ]);

    // Compute 10^dec without BigInt literal/exponent usage for broad TS targets
    let unit = BigInt(1);
    for (let j = 0; j < Number(dec); j++) unit = unit * TEN_BI;
    const price = prices[i];
    const priceUsd = Number(price) / Number(baseUnit);

    const tvlUSD = Number(aTokenSupply) / Number(unit) * priceUsd;
    const availableUSD = Number(underlyingBal) / Number(unit) * priceUsd;

    const configWord: bigint | undefined = (resData?.configuration?.data ?? resData?.[0]?.data ?? resData?.[0]) as bigint | undefined;
    const cfg = decodeReserveConfigurationMap(configWord);

    let utilizationPercent: number | undefined;
    try {
      const vSupply = await ethClient.readContract({ address: vDebt, abi: ERC20_MIN_ABI, functionName: "totalSupply" }) as bigint;
      utilizationPercent = aTokenSupply === BigInt(0) ? 0 : (Number(vSupply) / Number(aTokenSupply)) * 100;
    } catch {}

    return {
      asset,
      symbol: sym,
      decimals: Number(dec) || 18,
      aToken,
      variableDebtToken: vDebt,
      supplyAprPercent: toPercentFromRay(resData?.currentLiquidityRate ?? resData?.[2]),
      utilizationPercent,
      availableLiquidityNative: (Number(underlyingBal) / Math.pow(10, Number(dec))).toString(),
      tvlUSD,
      availableUSD,
      capacityHeadroomUSD: String(Math.max(0, Math.floor(availableUSD))),
      isActive: cfg?.isActive,
      isFrozen: cfg?.isFrozen,
    } as AaveReserveSnapshot;
  }));

  const blockNum = await ethClient.getBlockNumber();
  return {
    network: "ethereum",
    reserves: out.sort((a, b) => (b.supplyAprPercent || 0) - (a.supplyAprPercent || 0)),
    asOfBlock: blockNum.toString(),
  };
}


