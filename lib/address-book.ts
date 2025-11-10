// Central address book (defaults) – envs can override these
// Provided by user; used as fallbacks throughout the app
export const AddressBook = {
	orchestrator: "0xCE37D3D6A051BF02E9484cF00bdf3c930A34F970" as const,
	reallocator: "0x2b69687Bb20d62A4d7f66E843A68df891A51D09f" as const,
	vaults: {
		WETH: "0xDD2C410ab71a1e579013B2a59aae5dcAA7188A1B",
		USDC: "0x8aF0fFFA40EA260b1a836c586892562115A275BF",
		USDT: "0x4f9E36EeC1c9e96F851B99872577B20d8CdC4cFc",
		DAI: "0xb48EddED9DF6E1D676AfBA7793a6DC0FA49418d4",
	} as const,
	assets: {
		WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
		USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
		DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
	} as const,
	strategies: {
		WETH: {
			Balanced: "0x110941177b179849C1AfE51512024944AA92B331",
			MaxHumanitarian: "0xE23e23461dFc75308E49F5Da1abf065a61B3Cc1E",
			MaxCrypto: "0x29EC1CfaE65f11D75508e608C51D5AD698D46faf",
		},
		USDC: {
			Balanced: "0x461f6Ff6eab107c419123A7757b4Ab7eB65526d7",
			MaxHumanitarian: "0xA293C08da3715d3c624f84Cf813Da3f023f2A9e9",
			MaxCrypto: "0x9cA68Fe565b1E9f38C202dba3f3821f5eBD1213b",
		},
		USDT: {
			Balanced: "0xFdcdB19FA0b7497AA57280EBA1ABda5AB96F65Bc",
			MaxHumanitarian: "0x1FB3A0A69e79f3A0d43782C97d2cD11e3ea2eB4e",
			MaxCrypto: "0xF908A9247b0b21A0775B848B77EedaE8451eec85",
		},
		DAI: {
			Balanced: "0xf1f1Aee6A6a6c0CFEA3227d0e34421B4e31f04D5",
			MaxHumanitarian: "0x2062808beCe226f426b63dFb982199Fd84F5E0d8",
			MaxCrypto: "0xF31d3e5924432A8362c2D4FC4f708D0770E655e8",
		},
	} as const,
	donationReceivers: {
		Balanced: "0xAd49069F5D0632d26e151601c0BdaC360Fb1D526",
		MaxHumanitarian: "0x54FE61E4F2eaa441698174FDe699Ce99b212204F",
		MaxCrypto: "0x16F596a33fab22Cfe3f37C9b19461783DDA117Da",
	} as const,
} as const;

export type AssetSymbol = keyof typeof AddressBook.vaults; // "WETH" | "USDC" | "USDT" | "DAI"
export type Profile = keyof typeof AddressBook.donationReceivers; // "Balanced" | "MaxHumanitarian" | "MaxCrypto"

export function getOrchestratorAddress(): `0x${string}` {
	const envs = [
		"NEXT_PUBLIC_ORCHESTRATOR_ADDRESS",
		"NEXT_PUBLIC_ORCHESTRATOR",
		"ORCHESTRATOR_ADDRESS",
	];
	for (const k of envs) {
		const v = (process.env[k] || "").trim();
		if (v && v.startsWith("0x")) return v as `0x${string}`;
	}
	return AddressBook.orchestrator as `0x${string}`;
}

export function getReallocatorAddress(): `0x${string}` {
	const envs = ["NEXT_PUBLIC_AGENT_REALLOCATOR", "AGENT_REALLOCATOR_ADDRESS"];
	for (const k of envs) {
		const v = (process.env[k] || "").trim();
		if (v && v.startsWith("0x")) return v as `0x${string}`;
	}
	return AddressBook.reallocator as `0x${string}`;
}

export function getVaultAddress(symbol: AssetSymbol): `0x${string}` | undefined {
	const pubKey = `NEXT_PUBLIC_VAULT_${symbol}`;
	const srvKey = `VAULT_${symbol}`;
	const pub = (process.env[pubKey] || "").trim();
	if (pub && pub.startsWith("0x")) return pub as `0x${string}`;
	const srv = (process.env[srvKey] || "").trim();
	if (srv && srv.startsWith("0x")) return srv as `0x${string}`;
	return AddressBook.vaults[symbol] as `0x${string}`;
}

export function getAssetAddress(symbol: AssetSymbol): `0x${string}` {
	const envKey = `ASSET_${symbol}`;
	const fromEnv = (process.env[envKey] || "").trim();
	if (fromEnv && fromEnv.startsWith("0x")) return fromEnv as `0x${string}`;
	return AddressBook.assets[symbol] as `0x${string}`;
}

export function getStrategyAddress(symbol: AssetSymbol, profile: Profile): `0x${string}` | undefined {
	const envKey = `STRATEGY_${symbol}_${profile}`.toUpperCase();
	const v = (process.env[envKey] || "").trim();
	if (v && v.startsWith("0x")) return v as `0x${string}`;
	const group = (AddressBook.strategies as any)[symbol];
	return group ? (group as any)[profile] as `0x${string}` : undefined;
}

export function getDonationReceiver(profile: Profile): `0x${string}` {
	const envKey = `DONATION_${profile}`.toUpperCase();
	const v = (process.env[envKey] || "").trim();
	if (v && v.startsWith("0x")) return v as `0x${string}`;
	return AddressBook.donationReceivers[profile] as `0x${string}`;
}


