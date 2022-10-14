import { NonceManager } from "@ethersproject/experimental";
import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { GasPriceManager } from "../utils/GasPriceManager";

async function main() {
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const ExecutionFactory = await ethers.getContractFactory("FundExecution");

    const provider = ethers.provider;

    const admin = new Wallet(process.env.ADMIN_KEY || "");
    const adminSigner = new NonceManager(new GasPriceManager(provider.getSigner(admin.address)));
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    
    const fundExec = await ExecutionFactory.attach(process.env.EXEC_CONTRACT || "");

    await commonsBudget.connect(adminSigner).setExecContract(fundExec.address);
    console.log("FundExcution address:", fundExec.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});