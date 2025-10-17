import type { Abi } from "viem";
import RebasingWrapperJson from "./RebasingWrapper.json";

// Export the ABI from the compiled JSON artifact
export const RebasingWrapperAbi = RebasingWrapperJson.abi as unknown as Abi;


