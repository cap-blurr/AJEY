import { publicClient } from "@/lib/chain";

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
  { name: "getPriceOracle", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

const ERC20_MIN_ABI = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string", name: "" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8", name: "" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256", name: "" }] },
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
      const data: any = await publicClient.readContract({ address: pool, abi, functionName: "getReserveData", args: [asset] });
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
  tvlUSD?: string;
  availableUSD?: string;
  capacityHeadroomUSD?: string;
  isActive?: boolean;
  isFrozen?: boolean;
};

export async function fetchAaveSupplySnapshot(): Promise<{ reserves: AaveReserveSnapshot[]; oracle?: `0x${string}`; baseUnit?: string }>
{
  const POOL = ((process.env.AAVE_POOL_PROXY || process.env.AAVE_BASE_SEPOLIA_POOL) || "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27") as `0x${string}`;
  const ADDRESSES_PROVIDER = (process.env.AAVE_ADDRESSES_PROVIDER || "") as `0x${string}` | "";

  let ORACLE: `0x${string}` | undefined = (process.env.AAVE_ORACLE as `0x${string}` | undefined);
  if (!ORACLE && ADDRESSES_PROVIDER) {
    try { ORACLE = await publicClient.readContract({ address: ADDRESSES_PROVIDER, abi: PoolAddressesProvider_ABI, functionName: "getPriceOracle" }) as `0x${string}`; } catch {}
  }

  const reserves = await publicClient.readContract({ address: POOL, abi: IPool_ABI, functionName: "getReservesList" }) as `0x${string}`[];
  const prices: bigint[] | undefined = ORACLE
    ? await publicClient.readContract({ address: ORACLE, abi: AaveOracle_ABI, functionName: "getAssetsPrices", args: [reserves] }) as bigint[]
    : undefined;
  let baseUnit: bigint | undefined;
  if (ORACLE) {
    try { baseUnit = await publicClient.readContract({ address: ORACLE, abi: AaveOracle_ABI, functionName: "BASE_CURRENCY_UNIT" }) as bigint; } catch {}
  }

  const out: AaveReserveSnapshot[] = [];
  for (let i = 0; i < reserves.length; i++) {
    const asset = reserves[i] as `0x${string}`;
    let symbol = "?";
    let decimals = 18;
    try {
      const [sym, dec] = await Promise.all([
        publicClient.readContract({ address: asset, abi: ERC20_MIN_ABI, functionName: "symbol" }) as Promise<string>,
        publicClient.readContract({ address: asset, abi: ERC20_MIN_ABI, functionName: "decimals" }) as Promise<number>,
      ]);
      symbol = sym;
      decimals = Number(dec) || 18;
    } catch {}

    // token addresses
    let aToken: `0x${string}` = "0x0000000000000000000000000000000000000000";
    let vDebt: `0x${string}` = "0x0000000000000000000000000000000000000000";
    try { aToken = await publicClient.readContract({ address: POOL, abi: IPool_ABI, functionName: "getReserveAToken", args: [asset] }) as `0x${string}`; } catch {}
    try { vDebt = await publicClient.readContract({ address: POOL, abi: IPool_ABI, functionName: "getReserveVariableDebtToken", args: [asset] }) as `0x${string}`; } catch {}

    // reserve data
    const resData: any = await readReserveDataFlexible(POOL, asset);
    const configWord: bigint | undefined = (resData?.configuration?.data ?? resData?.[0]?.data ?? resData?.[0]) as bigint | undefined;
    const cfg = decodeReserveConfigurationMap(configWord);
    const supplyAprPercent = toPercentFromRay(resData?.currentLiquidityRate ?? resData?.[2]);

    // supplies
    let aSupply = BigInt(0);
    let vSupply = BigInt(0);
    try { aSupply = await publicClient.readContract({ address: aToken, abi: ERC20_MIN_ABI, functionName: "totalSupply" }) as bigint; } catch {}
    try { vSupply = await publicClient.readContract({ address: vDebt, abi: ERC20_MIN_ABI, functionName: "totalSupply" }) as bigint; } catch {}

    const available = aSupply > vSupply ? (aSupply - vSupply) : BigInt(0);
    const utilizationPercent = aSupply === BigInt(0) ? 0 : (Number(vSupply) / Number(aSupply)) * 100;

    // USD metrics
    const price = prices?.[i];
    let tvlUSD: string | undefined;
    let availableUSD: string | undefined;
    let capacityHeadroomUSD: string | undefined;
    if (price !== undefined && baseUnit && baseUnit > BigInt(0)) {
      // pow10 without BigInt exponent operator
      let pow = BigInt(1);
      for (let j = 0; j < decimals; j++) pow = pow * TEN_BI;
      const tvlBase = (price * aSupply) / pow;
      const availBase = (price * available) / pow;
      // naive string scaling to base unit decimals
      const baseDec = (() => { let d = 0, x = baseUnit; while (x > ONE_BI && x % TEN_BI === BigInt(0)) { x = x / TEN_BI; d++; } return d; })();
      const fmt = (x: bigint) => {
        const s = x.toString();
        if (baseDec === 0) return s;
        const pad = Math.max(0, baseDec - s.length);
        const z = (pad ? "0".repeat(pad) : "") + s;
        const head = z.slice(0, Math.max(0, z.length - baseDec)) || "0";
        const tail = z.slice(-baseDec);
        return `${head}.${tail}`.replace(/\.0+$/, "");
      };
      tvlUSD = fmt(tvlBase);
      availableUSD = fmt(availBase);

      if (cfg?.supplyCapRaw) {
        const capRaw = BigInt(cfg.supplyCapRaw);
        if (capRaw === BigInt(0)) capacityHeadroomUSD = "unlimited"; else {
          const capNative = capRaw * pow;
          const headNative = capNative > aSupply ? (capNative - aSupply) : BigInt(0);
          capacityHeadroomUSD = fmt((price * headNative) / pow);
        }
      }
    }

    out.push({
      asset,
      symbol,
      decimals,
      aToken,
      variableDebtToken: vDebt,
      supplyAprPercent,
      utilizationPercent,
      availableLiquidityNative: (Number(available) / 10 ** decimals).toString(),
      tvlUSD,
      availableUSD,
      capacityHeadroomUSD,
      isActive: cfg?.isActive,
      isFrozen: cfg?.isFrozen,
    });
  }

  return { reserves: out, oracle: ORACLE, baseUnit: baseUnit ? baseUnit.toString() : undefined };
}


