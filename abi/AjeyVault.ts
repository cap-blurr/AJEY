import type { Abi } from "viem";
import AjeyVaultJson from "./AjeyVault.json";

// Export the ABI from the compiled JSON artifact
export const AjeyVaultAbi = AjeyVaultJson.abi as unknown as Abi;


